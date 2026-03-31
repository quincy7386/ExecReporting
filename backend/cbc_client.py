"""
Carbon Black Cloud API client.

Supports two data sources:
  - alerts:  POST /api/alerts/v7/orgs/{org_key}/alerts/_search
  - devices: POST /appservices/v6/orgs/{org_key}/devices/_search

Each source supports two query modes:
  - list:  returns raw rows up to row_limit
  - chart: groups results by a field, returning [{label, count}]
"""
import collections
from typing import Any

import httpx

from backend.models import Credentials
from backend.crypto import decrypt


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _auth_header(creds: Credentials) -> dict[str, str]:
    api_secret = decrypt(creds.api_secret_encrypted)
    return {
        "X-AUTH-TOKEN": f"{api_secret}/{creds.api_id}",
        "Content-Type": "application/json",
    }


def _base_url(creds: Credentials) -> str:
    hostname = creds.hostname.rstrip("/")
    if not hostname.startswith("http"):
        hostname = f"https://{hostname}"
    return hostname


def _group_results(results: list[dict], group_by: str) -> list[dict[str, Any]]:
    """Aggregate a list of records by a field, returning [{label, count}]."""
    counts: collections.Counter = collections.Counter()
    for record in results:
        value = record.get(group_by)
        if value is None:
            counts["(none)"] += 1
        elif isinstance(value, list):
            for v in value:
                counts[str(v)] += 1
        else:
            counts[str(value)] += 1
    return [{"label": label, "count": count} for label, count in counts.most_common()]


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

async def _search_alerts(
    creds: Credentials,
    query: str,
    rows: int,
    start: int = 1,
    time_range: str = "-2w",
) -> dict[str, Any]:
    url = f"{_base_url(creds)}/api/alerts/v7/orgs/{creds.org_key}/alerts/_search"
    payload = {
        "query": query,
        "start": start,
        "rows": rows,
        "time_range": {"range": time_range},
        "sort": [{"field": "backend_timestamp", "order": "DESC"}],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=_auth_header(creds), json=payload)
        resp.raise_for_status()
        return resp.json()


async def fetch_list(
    creds: Credentials,
    query: str,
    row_limit: int,
    time_range: str = "-2w",
) -> list[dict[str, Any]]:
    data = await _search_alerts(creds, query, rows=min(row_limit, 100), time_range=time_range)
    return data.get("results", [])[:row_limit]


async def fetch_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    time_range: str = "-2w",
    max_fetch: int = 10_000,
) -> list[dict[str, Any]]:
    batch = 100
    results: list[dict] = []
    start = 1

    while len(results) < max_fetch:
        rows_to_fetch = min(batch, max_fetch - len(results))
        data = await _search_alerts(creds, query, rows=rows_to_fetch, start=start, time_range=time_range)
        batch_results = data.get("results", [])
        if not batch_results:
            break
        results.extend(batch_results)
        num_available = data.get("num_available", 0)
        start += rows_to_fetch
        if start > num_available:
            break

    return _group_results(results, group_by)


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

async def _search_devices(
    creds: Credentials,
    query: str,
    rows: int,
    start: int = 0,
) -> dict[str, Any]:
    url = f"{_base_url(creds)}/appservices/v6/orgs/{creds.org_key}/devices/_search"
    payload = {
        "query": query,
        "start": start,
        "rows": rows,
        "sort": [{"field": "last_contact_time", "order": "DESC"}],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=_auth_header(creds), json=payload)
        resp.raise_for_status()
        return resp.json()


async def fetch_devices_list(
    creds: Credentials,
    query: str,
    row_limit: int,
) -> list[dict[str, Any]]:
    data = await _search_devices(creds, query, rows=min(row_limit, 100))
    return data.get("results", [])[:row_limit]


async def fetch_devices_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    max_fetch: int = 10_000,
) -> list[dict[str, Any]]:
    batch = 100
    results: list[dict] = []
    start = 0

    while len(results) < max_fetch:
        rows_to_fetch = min(batch, max_fetch - len(results))
        data = await _search_devices(creds, query, rows=rows_to_fetch, start=start)
        batch_results = data.get("results", [])
        if not batch_results:
            break
        results.extend(batch_results)
        num_found = data.get("num_found", 0)
        start += rows_to_fetch
        if start >= num_found:
            break

    return _group_results(results, group_by)


# ---------------------------------------------------------------------------
# Observations (async job pattern)
# ---------------------------------------------------------------------------

async def _submit_observations_job(
    creds: Credentials,
    query: str,
    time_range: str = "-2w",
) -> str:
    """Submit an observations search job and return the job_id."""
    url = f"{_base_url(creds)}/api/investigate/v2/orgs/{creds.org_key}/observations/search_jobs"
    payload = {
        "query": query,
        "time_range": {"range": time_range},
        "fields": ["*"],
        "rows": 0,  # we only need the job_id at this stage
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=_auth_header(creds), json=payload)
        resp.raise_for_status()
        return resp.json()["job_id"]


async def _fetch_observations_results(
    creds: Credentials,
    job_id: str,
    start: int = 0,
    rows: int = 500,
) -> dict[str, Any]:
    url = f"{_base_url(creds)}/api/investigate/v2/orgs/{creds.org_key}/observations/search_jobs/{job_id}/results"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=_auth_header(creds), params={"start": start, "rows": rows})
        resp.raise_for_status()
        return resp.json()


async def _wait_for_observations_job(
    creds: Credentials,
    job_id: str,
    max_wait_seconds: int = 25,
) -> None:
    """Poll until the job is complete or timeout is reached."""
    import asyncio
    waited = 0
    while waited < max_wait_seconds:
        data = await _fetch_observations_results(creds, job_id, start=0, rows=0)
        if data.get("contacted") == data.get("completed"):
            return
        await asyncio.sleep(2)
        waited += 2


async def fetch_observations_list(
    creds: Credentials,
    query: str,
    row_limit: int,
    time_range: str = "-2w",
) -> list[dict[str, Any]]:
    job_id = await _submit_observations_job(creds, query, time_range)
    await _wait_for_observations_job(creds, job_id)
    data = await _fetch_observations_results(creds, job_id, start=0, rows=min(row_limit, 500))
    return data.get("results", [])[:row_limit]


async def fetch_observations_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    time_range: str = "-2w",
    max_fetch: int = 10_000,
) -> list[dict[str, Any]]:
    job_id = await _submit_observations_job(creds, query, time_range)
    await _wait_for_observations_job(creds, job_id)

    batch = 500
    results: list[dict] = []
    start = 0

    while len(results) < max_fetch:
        rows_to_fetch = min(batch, max_fetch - len(results))
        data = await _fetch_observations_results(creds, job_id, start=start, rows=rows_to_fetch)
        batch_results = data.get("results", [])
        if not batch_results:
            break
        results.extend(batch_results)
        num_available = data.get("num_available", 0)
        start += rows_to_fetch
        if start >= num_available:
            break

    return _group_results(results, group_by)


# ---------------------------------------------------------------------------
# Connection test
# ---------------------------------------------------------------------------

async def test_connection(creds: Credentials) -> dict[str, Any]:
    try:
        data = await _search_alerts(creds, "*", rows=1)
        return {"ok": True, "num_found": data.get("num_found", 0)}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "error": f"HTTP {e.response.status_code}: {e.response.text}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
