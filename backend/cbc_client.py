"""
Carbon Black Cloud API client.

Handles authentication and two query modes:
  - list:  returns raw alert rows up to row_limit
  - chart: fetches up to 10 000 alerts and groups by a field client-side,
           returning [{label, count}] suitable for pie/bar/line charts.
"""
import asyncio
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


def _alerts_url(creds: Credentials) -> str:
    hostname = creds.hostname.rstrip("/")
    if not hostname.startswith("http"):
        hostname = f"https://{hostname}"
    return f"{hostname}/api/alerts/v7/orgs/{creds.org_key}/alerts/_search"


# ---------------------------------------------------------------------------
# Core search — returns raw alert dicts
# ---------------------------------------------------------------------------

async def _search_alerts(
    creds: Credentials,
    query: str,
    rows: int,
    start: int = 0,
) -> dict[str, Any]:
    url = _alerts_url(creds)
    payload = {
        "query": query,
        "start": start,
        "rows": rows,
        "sort": [{"field": "backend_timestamp", "order": "DESC"}],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=_auth_header(creds), json=payload)
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def fetch_list(
    creds: Credentials,
    query: str,
    row_limit: int,
) -> list[dict[str, Any]]:
    """Return up to row_limit alert records as raw dicts."""
    data = await _search_alerts(creds, query, rows=min(row_limit, 100))
    return data.get("results", [])[:row_limit]


async def fetch_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    max_fetch: int = 10_000,
) -> list[dict[str, Any]]:
    """
    Fetch up to max_fetch alerts and group by group_by field.
    Returns [{"label": value, "count": n}, ...] sorted descending by count.
    """
    batch = 100
    results: list[dict] = []
    start = 0

    while len(results) < max_fetch:
        rows_to_fetch = min(batch, max_fetch - len(results))
        data = await _search_alerts(creds, query, rows=rows_to_fetch, start=start)
        batch_results = data.get("results", [])
        if not batch_results:
            break
        results.extend(batch_results)
        num_available = data.get("num_available", 0)
        start += rows_to_fetch
        if start >= num_available:
            break

    counts: dict[str, int] = collections.Counter()
    for alert in results:
        value = alert.get(group_by)
        if value is None:
            label = "(none)"
        elif isinstance(value, list):
            # Some CBC fields are arrays (e.g. device_os); count each entry
            for v in value:
                counts[str(v)] += 1
            continue
        else:
            label = str(value)
        counts[label] += 1

    return [
        {"label": label, "count": count}
        for label, count in counts.most_common()
    ]


async def test_connection(creds: Credentials) -> dict[str, Any]:
    """Quick connectivity check — fetches 1 alert. Returns status dict."""
    try:
        data = await _search_alerts(creds, "*", rows=1)
        return {"ok": True, "num_found": data.get("num_found", 0)}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "error": f"HTTP {e.response.status_code}: {e.response.text}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
