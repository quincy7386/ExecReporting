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
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)

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


def _time_range_to_iso(range_str: str) -> tuple[str, str]:
    """Convert '-2w' style range string to (start_iso, end_iso) UTC timestamps."""
    now = datetime.now(timezone.utc)
    unit = range_str[-1]
    value = int(range_str[1:-1])
    delta = {"h": timedelta(hours=value), "d": timedelta(days=value), "w": timedelta(weeks=value)}.get(unit, timedelta(days=14))
    fmt = "%Y-%m-%dT%H:%M:%S.000Z"
    return (now - delta).strftime(fmt), now.strftime(fmt)


def _get_nested(record: dict, field: str) -> Any:
    """Resolve a dot-notation field path from a nested dict (e.g. 'vuln_info.severity')."""
    parts = field.split(".")
    val: Any = record
    for part in parts:
        if not isinstance(val, dict):
            return None
        val = val.get(part)
    return val


def _group_results(
    results: list[dict],
    group_by: str,
    sort_order: str = "desc",
    agg_field: str | None = None,
    agg_func: str = "count",
) -> list[dict[str, Any]]:
    """Aggregate records by group_by, returning [{label, count}].

    Supports dot-notation for nested fields (e.g. 'vuln_info.severity').
    When agg_field is set, the 'count' value is the result of agg_func
    (sum/avg/max/min) applied to that field's numeric values per group.
    Falls back to record count when agg_field is None or agg_func is 'count'.
    """
    if not agg_field or agg_func == "count":
        counts: collections.Counter = collections.Counter()
        for record in results:
            value = _get_nested(record, group_by)
            if value is None:
                counts["(none)"] += 1
            elif isinstance(value, list):
                for v in value:
                    counts[str(v)] += 1
            else:
                counts[str(value)] += 1
        items = counts.most_common()
        if sort_order == "asc":
            items = list(reversed(items))
        return [{"label": label, "count": count} for label, count in items]

    # Numeric aggregation — group by group_by, aggregate agg_field
    groups: dict[str, list[float]] = {}
    for record in results:
        key = _get_nested(record, group_by)
        keys = [str(v) for v in key] if isinstance(key, list) else [str(key) if key is not None else "(none)"]
        raw = _get_nested(record, agg_field)
        try:
            num = float(raw) if raw is not None else None
        except (TypeError, ValueError):
            num = None
        for k in keys:
            groups.setdefault(k, [])
            if num is not None:
                groups[k].append(num)

    def _apply(vals: list[float]) -> float:
        if not vals:
            return 0.0
        if agg_func == "sum":
            return sum(vals)
        if agg_func == "avg":
            return sum(vals) / len(vals)
        if agg_func == "max":
            return max(vals)
        if agg_func == "min":
            return min(vals)
        return float(len(vals))

    aggregated = [(k, _apply(v)) for k, v in groups.items()]
    aggregated.sort(key=lambda x: x[1], reverse=(sort_order != "asc"))
    return [{"label": label, "count": value} for label, value in aggregated]


def _group_results_stacked(
    results: list[dict],
    group_by: str,
    split_by: str,
    sort_order: str = "desc",
    max_split: int = 8,
) -> list[dict[str, Any]]:
    """Two-field aggregation for stacked bar charts.

    Returns [{label: group_val, split_val1: count, split_val2: count, ...}]
    with the top max_split values of split_by as segments.
    """
    # Determine top N values of the split field
    split_counts: collections.Counter = collections.Counter()
    for record in results:
        v = _get_nested(record, split_by)
        if v is None:
            continue
        if isinstance(v, list):
            for item in v:
                split_counts[str(item)] += 1
        else:
            split_counts[str(v)] += 1

    top_splits = [v for v, _ in split_counts.most_common(max_split)]
    if not top_splits:
        return []

    # Build cross-tabulation
    data: dict[str, dict[str, int]] = {}
    for record in results:
        grp = _get_nested(record, group_by)
        if isinstance(grp, list):
            grp_keys = [str(g) for g in grp] if grp else ["(none)"]
        else:
            grp_keys = [str(grp) if grp is not None else "(none)"]

        sv = _get_nested(record, split_by)
        if isinstance(sv, list):
            split_vals = [str(v) for v in sv if str(v) in top_splits]
        else:
            split_vals = [str(sv)] if sv is not None and str(sv) in top_splits else []

        for gk in grp_keys:
            if gk not in data:
                data[gk] = {s: 0 for s in top_splits}
            for sv_str in split_vals:
                data[gk][sv_str] += 1

    rows = [{"label": lbl, **seg, "__total__": sum(seg.values())} for lbl, seg in data.items()]
    rows.sort(key=lambda x: x["__total__"], reverse=(sort_order != "asc"))
    for row in rows:
        del row["__total__"]
    return rows


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

async def _search_alerts(
    creds: Credentials,
    query: str,
    rows: int,
    start: int = 1,
    time_range: str = "-2w",
    sort_order: str = "desc",
) -> dict[str, Any]:
    url = f"{_base_url(creds)}/api/alerts/v7/orgs/{creds.org_key}/alerts/_search"
    payload = {
        "query": query,
        "start": start,
        "rows": rows,
        "time_range": {"range": time_range},
        "sort": [{"field": "backend_timestamp", "order": sort_order.upper()}],
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
    sort_order: str = "desc",
) -> list[dict[str, Any]]:
    data = await _search_alerts(creds, query, rows=min(row_limit, 100), time_range=time_range, sort_order=sort_order)
    return data.get("results", [])[:row_limit]


async def fetch_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    time_range: str = "-2w",
    sort_order: str = "desc",
    agg_field: str | None = None,
    agg_func: str = "count",
    bar_split_by: str | None = None,
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

    if bar_split_by:
        return _group_results_stacked(results, group_by, bar_split_by, sort_order)
    return _group_results(results, group_by, sort_order, agg_field, agg_func)


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

async def _search_devices(
    creds: Credentials,
    query: str,
    rows: int,
    start: int = 0,
    sort_order: str = "desc",
    active_only: bool = False,
) -> dict[str, Any]:
    url = f"{_base_url(creds)}/appservices/v6/orgs/{creds.org_key}/devices/_search"
    payload: dict[str, Any] = {
        "start": start,
        "rows": rows,
        "sort": [{"field": "last_contact_time", "order": sort_order.upper()}],
    }
    if query.strip() and query.strip() != "*":
        payload["query"] = query
    if active_only:
        payload["criteria"] = {"status": ["ACTIVE"]}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=_auth_header(creds), json=payload)
        resp.raise_for_status()
        return resp.json()


async def _facet_devices(
    creds: Credentials,
    query: str,
    group_by: str,
    active_only: bool = False,
) -> list[dict[str, Any]]:
    """Single-call device facet query — returns exact counts for any field, no pagination."""
    url = f"{_base_url(creds)}/appservices/v6/orgs/{creds.org_key}/devices/_facet"
    # rows=500 on terms to avoid truncation on high-cardinality fields like os_version
    payload: dict[str, Any] = {"terms": {"fields": [group_by], "rows": 500}}
    if query.strip() and query.strip() != "*":
        payload["query"] = query
    if active_only:
        payload["criteria"] = {"status": ["ACTIVE"]}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=_auth_header(creds), json=payload)
        resp.raise_for_status()
        return resp.json().get("results", [])


async def fetch_devices_list(
    creds: Credentials,
    query: str,
    row_limit: int,
    sort_order: str = "desc",
) -> list[dict[str, Any]]:
    data = await _search_devices(creds, query, rows=min(row_limit, 100), sort_order=sort_order)
    return data.get("results", [])[:row_limit]


async def fetch_devices_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    sort_order: str = "desc",
    agg_field: str | None = None,
    agg_func: str = "count",
    active_only: bool = False,
    bar_split_by: str | None = None,
    max_fetch: int = 10_000,
) -> list[dict[str, Any]]:
    # Facets API: single call, exact counts at any scale, supports all device fields.
    # Use it for simple count queries. Fall back to _search for custom agg or stacked bars.
    if (not agg_field or agg_func == "count") and not bar_split_by:
        facets = await _facet_devices(creds, query, group_by, active_only=active_only)
        rows: list[dict[str, Any]] = []
        for facet in facets:
            if facet.get("field") == group_by:
                for v in facet.get("values", []):
                    label = str(v.get("name") or v.get("id") or "(none)")
                    rows.append({"label": label, "count": v.get("total", 0)})
                break
        rows.sort(key=lambda x: x["count"], reverse=(sort_order != "asc"))
        return rows

    # Custom aggregation or stacked bar — fetch full records and aggregate client-side
    batch = 100
    results: list[dict] = []
    start = 0

    while len(results) < max_fetch:
        rows_to_fetch = min(batch, max_fetch - len(results))
        data = await _search_devices(creds, query, rows=rows_to_fetch, start=start, active_only=active_only)
        batch_results = data.get("results", [])
        if not batch_results:
            break
        results.extend(batch_results)
        num_found = data.get("num_found", 0)
        start += rows_to_fetch
        if start >= num_found:
            break

    if bar_split_by:
        return _group_results_stacked(results, group_by, bar_split_by, sort_order)
    return _group_results(results, group_by, sort_order, agg_field, agg_func)


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
    sort_order: str = "desc",
) -> list[dict[str, Any]]:
    job_id = await _submit_observations_job(creds, query, time_range)
    await _wait_for_observations_job(creds, job_id)
    data = await _fetch_observations_results(creds, job_id, start=0, rows=min(row_limit, 500))
    results = data.get("results", [])[:row_limit]
    if sort_order == "asc":
        results = list(reversed(results))
    return results


async def fetch_observations_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    time_range: str = "-2w",
    sort_order: str = "desc",
    agg_field: str | None = None,
    agg_func: str = "count",
    bar_split_by: str | None = None,
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

    if bar_split_by:
        return _group_results_stacked(results, group_by, bar_split_by, sort_order)
    return _group_results(results, group_by, sort_order, agg_field, agg_func)


# ---------------------------------------------------------------------------
# Process Search (Enterprise EDR — async job pattern)
# ---------------------------------------------------------------------------

async def _submit_process_job(
    creds: Credentials,
    query: str,
    time_range: str = "-2w",
) -> str:
    url = f"{_base_url(creds)}/api/investigate/v2/orgs/{creds.org_key}/processes/search_jobs"
    payload = {
        "query": query,
        "time_range": {"range": time_range},
        "fields": ["*"],
        "rows": 0,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=_auth_header(creds), json=payload)
        resp.raise_for_status()
        return resp.json()["job_id"]


async def _fetch_process_results(
    creds: Credentials,
    job_id: str,
    start: int = 0,
    rows: int = 100,
) -> dict[str, Any]:
    url = f"{_base_url(creds)}/api/investigate/v2/orgs/{creds.org_key}/processes/search_jobs/{job_id}/results"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=_auth_header(creds), params={"start": start, "rows": rows})
        resp.raise_for_status()
        return resp.json()


async def _wait_for_process_job(
    creds: Credentials,
    job_id: str,
    max_wait_seconds: int = 25,
) -> None:
    import asyncio
    waited = 0
    while waited < max_wait_seconds:
        data = await _fetch_process_results(creds, job_id, start=0, rows=0)
        if data.get("contacted") == data.get("completed"):
            return
        await asyncio.sleep(2)
        waited += 2


async def fetch_process_list(
    creds: Credentials,
    query: str,
    row_limit: int,
    time_range: str = "-2w",
    sort_order: str = "desc",
) -> list[dict[str, Any]]:
    job_id = await _submit_process_job(creds, query, time_range)
    await _wait_for_process_job(creds, job_id)
    data = await _fetch_process_results(creds, job_id, start=0, rows=min(row_limit, 100))
    results = data.get("results", [])[:row_limit]
    if sort_order == "asc":
        results = list(reversed(results))
    return results


async def fetch_process_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    time_range: str = "-2w",
    sort_order: str = "desc",
    agg_field: str | None = None,
    agg_func: str = "count",
    bar_split_by: str | None = None,
    max_fetch: int = 10_000,
) -> list[dict[str, Any]]:
    job_id = await _submit_process_job(creds, query, time_range)
    await _wait_for_process_job(creds, job_id)

    batch = 100
    results: list[dict] = []
    start = 0

    while len(results) < max_fetch:
        rows_to_fetch = min(batch, max_fetch - len(results))
        data = await _fetch_process_results(creds, job_id, start=start, rows=rows_to_fetch)
        batch_results = data.get("results", [])
        if not batch_results:
            break
        results.extend(batch_results)
        num_available = data.get("num_available", 0)
        start += rows_to_fetch
        if start >= num_available:
            break

    if bar_split_by:
        return _group_results_stacked(results, group_by, bar_split_by, sort_order)
    return _group_results(results, group_by, sort_order, agg_field, agg_func)


# ---------------------------------------------------------------------------
# Vulnerability Assessment (synchronous)
# ---------------------------------------------------------------------------

async def _search_vulnerabilities(
    creds: Credentials,
    query: str,
    rows: int,
    start: int = 0,
) -> dict[str, Any]:
    url = f"{_base_url(creds)}/vulnerability/assessment/api/v1/orgs/{creds.org_key}/devices/vulnerabilities/_search"
    payload: dict[str, Any] = {
        "start": start,
        "rows": rows,
        "fields": ["*"],
        "sort": [{"field": "risk_meter_score", "order": "DESC"}],
    }
    if query.strip() and query.strip() != "*":
        payload["query"] = query
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=_auth_header(creds), json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data


async def fetch_vulnerability_list(
    creds: Credentials,
    query: str,
    row_limit: int,
    sort_order: str = "desc",
) -> list[dict[str, Any]]:
    data = await _search_vulnerabilities(creds, query, rows=min(row_limit, 1000))
    results = data.get("results", [])[:row_limit]
    if sort_order == "asc":
        results = list(reversed(results))
    return results


async def fetch_vulnerability_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    sort_order: str = "desc",
    agg_field: str | None = None,
    agg_func: str = "count",
    bar_split_by: str | None = None,
    max_fetch: int = 10_000,
) -> list[dict[str, Any]]:
    batch = 1000
    results: list[dict] = []
    start = 0

    while len(results) < max_fetch:
        rows_to_fetch = min(batch, max_fetch - len(results))
        data = await _search_vulnerabilities(creds, query, rows=rows_to_fetch, start=start)
        batch_results = data.get("results", [])
        if not batch_results:
            break
        results.extend(batch_results)
        num_found = data.get("num_found", 0)
        start += rows_to_fetch
        if start >= num_found:
            break

    if bar_split_by:
        return _group_results_stacked(results, group_by, bar_split_by, sort_order)
    return _group_results(results, group_by, sort_order, agg_field, agg_func)


# ---------------------------------------------------------------------------
# Audit Logs (synchronous, 0-based pagination)
# ---------------------------------------------------------------------------

async def _search_audit_logs(
    creds: Credentials,
    query: str,
    rows: int,
    start: int = 0,
    time_range: str = "-2w",
    sort_order: str = "desc",
) -> dict[str, Any]:
    url = f"{_base_url(creds)}/audit_log/v1/orgs/{creds.org_key}/logs/_search"
    start_iso, end_iso = _time_range_to_iso(time_range)
    payload: dict[str, Any] = {
        "criteria": {"create_time": {"start": start_iso, "end": end_iso}},
        "rows": rows,
        "start": start,
        "sort": [{"field": "create_time", "order": sort_order.upper()}],
    }
    if query.strip() and query.strip() != "*":
        payload["query"] = query
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=_auth_header(creds), json=payload)
        resp.raise_for_status()
        return resp.json()


async def fetch_audit_log_list(
    creds: Credentials,
    query: str,
    row_limit: int,
    time_range: str = "-2w",
    sort_order: str = "desc",
) -> list[dict[str, Any]]:
    data = await _search_audit_logs(creds, query, rows=min(row_limit, 500), time_range=time_range, sort_order=sort_order)
    return data.get("results", [])[:row_limit]


async def fetch_audit_log_chart(
    creds: Credentials,
    query: str,
    group_by: str,
    time_range: str = "-2w",
    sort_order: str = "desc",
    agg_field: str | None = None,
    agg_func: str = "count",
    bar_split_by: str | None = None,
    max_fetch: int = 10_000,
) -> list[dict[str, Any]]:
    batch = 500
    results: list[dict] = []
    start = 0

    while len(results) < max_fetch:
        rows_to_fetch = min(batch, max_fetch - len(results))
        data = await _search_audit_logs(creds, query, rows=rows_to_fetch, start=start, time_range=time_range)
        batch_results = data.get("results", [])
        if not batch_results:
            break
        results.extend(batch_results)
        num_available = data.get("num_available", 0)
        start += rows_to_fetch
        if start >= num_available:
            break

    if bar_split_by:
        return _group_results_stacked(results, group_by, bar_split_by, sort_order)
    return _group_results(results, group_by, sort_order, agg_field, agg_func)


# ---------------------------------------------------------------------------
# Time-series (line chart) — bucket records by timestamp
# ---------------------------------------------------------------------------

# Timestamp field per data source
_TS_FIELD: dict[str, str] = {
    "alerts": "backend_timestamp",
    "observations": "backend_timestamp",
    "process_search": "backend_timestamp",
    "devices": "last_contact_time",
    "audit_logs": "create_time",
}


def _bucket_by_time(
    results: list[dict],
    ts_field: str,
    time_range: str,
    split_by: str | None = None,
    max_series: int = 6,
) -> list[dict[str, Any]]:
    """Bucket records by time interval, returning chronological [{label, count}].

    When split_by is set, returns [{label, value1: count, value2: count, ...}]
    for the top max_series values of that field.
    """
    now = datetime.now(timezone.utc)
    unit = time_range[-1]
    value = int(time_range[1:-1])
    delta = {
        "h": timedelta(hours=value),
        "d": timedelta(days=value),
        "w": timedelta(weeks=value),
    }.get(unit, timedelta(days=14))

    total_minutes = int(delta.total_seconds() / 60)
    bucket_minutes = next(
        (b for b in [5, 10, 15, 20, 30, 60, 120, 180, 360, 720, 1440, 2880]
         if total_minutes / b <= 15),
        2880,
    )
    window_start = now - delta
    label_fmt = "%b %d %H:%M" if bucket_minutes < 1440 else "%b %d"

    # Build bucket label list
    bucket_labels: list[str] = []
    t = window_start
    while t < now:
        bucket_labels.append(t.strftime(label_fmt))
        t += timedelta(minutes=bucket_minutes)
    n_buckets = len(bucket_labels)

    # Parse timestamps once, recording (bucket_idx, record)
    parsed: list[tuple[int, dict]] = []
    for record in results:
        ts_raw = record.get(ts_field)
        if ts_raw is None:
            continue
        try:
            if isinstance(ts_raw, (int, float)):
                ts = datetime.fromtimestamp(
                    ts_raw / 1000 if ts_raw > 1e10 else ts_raw, tz=timezone.utc
                )
            else:
                ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
        except (ValueError, TypeError, OSError):
            continue
        if ts < window_start or ts >= now:
            continue
        idx = int((ts - window_start).total_seconds() / (bucket_minutes * 60))
        if 0 <= idx < n_buckets:
            parsed.append((idx, record))

    if split_by:
        # Find top N values of the split field
        value_counts: collections.Counter = collections.Counter()
        for _, record in parsed:
            v = record.get(split_by)
            if v is not None:
                value_counts[str(v)] += 1
        top_values = [v for v, _ in value_counts.most_common(max_series)]

        # Count per bucket per value
        bucket_data: list[dict[str, int]] = [{v: 0 for v in top_values} for _ in bucket_labels]
        for idx, record in parsed:
            v = record.get(split_by)
            sv = str(v) if v is not None else None
            if sv in top_values:
                bucket_data[idx][sv] += 1

        return [{"label": bucket_labels[i], **bucket_data[i]} for i in range(n_buckets)]

    # Single series
    counts = [0] * n_buckets
    for idx, _ in parsed:
        counts[idx] += 1
    return [{"label": bucket_labels[i], "count": counts[i]} for i in range(n_buckets)]


async def fetch_timeseries(
    creds: Credentials,
    data_source: str,
    query: str,
    time_range: str = "-2w",
    active_only: bool = False,
    split_by: str | None = None,
    max_fetch: int = 10_000,
) -> list[dict[str, Any]]:
    """Fetch time-bucketed event counts for line chart display."""
    ts_field = _TS_FIELD.get(data_source, "backend_timestamp")

    if data_source == "alerts":
        batch, results, start = 100, [], 1
        while len(results) < max_fetch:
            n = min(batch, max_fetch - len(results))
            data = await _search_alerts(creds, query, rows=n, start=start, time_range=time_range)
            chunk = data.get("results", [])
            if not chunk:
                break
            results.extend(chunk)
            start += n
            if start > data.get("num_available", 0):
                break

    elif data_source == "observations":
        job_id = await _submit_observations_job(creds, query, time_range)
        await _wait_for_observations_job(creds, job_id)
        batch, results, start = 500, [], 0
        while len(results) < max_fetch:
            n = min(batch, max_fetch - len(results))
            data = await _fetch_observations_results(creds, job_id, start=start, rows=n)
            chunk = data.get("results", [])
            if not chunk:
                break
            results.extend(chunk)
            start += n
            if start >= data.get("num_available", 0):
                break

    elif data_source == "process_search":
        job_id = await _submit_process_job(creds, query, time_range)
        await _wait_for_process_job(creds, job_id)
        batch, results, start = 100, [], 0
        while len(results) < max_fetch:
            n = min(batch, max_fetch - len(results))
            data = await _fetch_process_results(creds, job_id, start=start, rows=n)
            chunk = data.get("results", [])
            if not chunk:
                break
            results.extend(chunk)
            start += n
            if start >= data.get("num_available", 0):
                break

    elif data_source == "audit_logs":
        batch, results, start = 500, [], 0
        while len(results) < max_fetch:
            n = min(batch, max_fetch - len(results))
            data = await _search_audit_logs(creds, query, rows=n, start=start, time_range=time_range)
            chunk = data.get("results", [])
            if not chunk:
                break
            results.extend(chunk)
            start += n
            if start >= data.get("num_available", 0):
                break

    elif data_source == "devices":
        batch, results, start = 100, [], 0
        while len(results) < max_fetch:
            n = min(batch, max_fetch - len(results))
            data = await _search_devices(creds, query, rows=n, start=start, active_only=active_only)
            chunk = data.get("results", [])
            if not chunk:
                break
            results.extend(chunk)
            start += n
            if start >= data.get("num_found", 0):
                break

    else:
        return []

    return _bucket_by_time(results, ts_field, time_range, split_by=split_by)


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
