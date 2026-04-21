"""
Widget polling scheduler using APScheduler.

Each enabled widget gets a job that fires on its poll_interval.
Jobs fetch data from CBC and write to widget_cache.
The scheduler is started/stopped via the FastAPI lifespan.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import Credentials, Widget, WidgetCache
from backend.cbc_client import (
    fetch_chart,
    fetch_devices_chart,
    fetch_observations_chart,
    fetch_process_chart,
    fetch_vulnerability_chart,
    fetch_audit_log_chart,
    fetch_timeseries,
)

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


# ---------------------------------------------------------------------------
# Job function
# ---------------------------------------------------------------------------

async def _poll_widget(widget_id: int) -> None:
    """Enforce a hard 2-minute timeout so a stalled job never blocks its slot indefinitely."""
    try:
        await asyncio.wait_for(_do_poll(widget_id), timeout=120.0)
    except asyncio.TimeoutError:
        logger.warning("Widget %d poll timed out after 120s", widget_id)
        db: Session = SessionLocal()
        try:
            _write_cache(db, widget_id, data=None, error="Poll timed out (>120s) — CBC API may be slow or unreachable")
        finally:
            db.close()


async def _do_poll(widget_id: int) -> None:
    db: Session = SessionLocal()
    try:
        widget: Widget | None = db.get(Widget, widget_id)
        if not widget or not widget.enabled:
            return

        creds: Credentials | None = db.query(Credentials).filter(Credentials.id == 1).first()
        if not creds:
            _write_cache(db, widget_id, data=None, error="No credentials configured")
            return

        try:
            row_limit = widget.row_limit or 25
            agg_kwargs = {"agg_field": widget.agg_field, "agg_func": widget.agg_func or "count"}
            bar_split_by = (widget.bar_split_by or None) if widget.chart_style == "bar" else None

            if widget.chart_style == "line":
                # Line chart always shows events over time regardless of group_by
                query = widget.search_query
                if widget.data_source == "alerts" and not widget.include_all_alerts:
                    query = f"({query}) AND workflow_status:OPEN"
                result = await fetch_timeseries(
                    creds, widget.data_source, query, widget.time_range,
                    active_only=widget.active_devices_only,
                    split_by=widget.line_split_by or None,
                )
            elif widget.data_source == "devices":
                result = await fetch_devices_chart(creds, widget.search_query, widget.group_by, sort_order=widget.sort_order, active_only=widget.active_devices_only, bar_split_by=bar_split_by, **agg_kwargs)
            elif widget.data_source == "observations":
                result = await fetch_observations_chart(creds, widget.search_query, widget.group_by, widget.time_range, sort_order=widget.sort_order, bar_split_by=bar_split_by, **agg_kwargs)
            elif widget.data_source == "process_search":
                result = await fetch_process_chart(creds, widget.search_query, widget.group_by, widget.time_range, sort_order=widget.sort_order, bar_split_by=bar_split_by, **agg_kwargs)
            elif widget.data_source == "vulnerability_assessment":
                result = await fetch_vulnerability_chart(creds, widget.search_query, widget.group_by, sort_order=widget.sort_order, bar_split_by=bar_split_by, **agg_kwargs)
            elif widget.data_source == "audit_logs":
                result = await fetch_audit_log_chart(creds, widget.search_query, widget.group_by, widget.time_range, sort_order=widget.sort_order, bar_split_by=bar_split_by, **agg_kwargs)
            else:
                query = widget.search_query
                if not widget.include_all_alerts:
                    query = f"({query}) AND workflow_status:OPEN"
                result = await fetch_chart(creds, query, widget.group_by, widget.time_range, sort_order=widget.sort_order, bar_split_by=bar_split_by, **agg_kwargs)

            if widget.chart_style == "list":
                result = result[:row_limit]

            _write_cache(db, widget_id, data=json.dumps(result), error=None)
            logger.info("Polled widget %d OK", widget_id)

        except Exception as e:
            err = str(e) or type(e).__name__
            logger.warning("Widget %d poll error: %s", widget_id, err)
            _write_cache(db, widget_id, data=None, error=err)

    finally:
        db.close()


def _write_cache(db: Session, widget_id: int, data: str | None, error: str | None) -> None:
    cache = db.get(WidgetCache, widget_id)
    if cache is None:
        cache = WidgetCache(widget_id=widget_id)
        db.add(cache)
    cache.data = data
    cache.error = error
    cache.last_updated = datetime.now(timezone.utc)
    db.commit()


# ---------------------------------------------------------------------------
# Scheduler management
# ---------------------------------------------------------------------------

def _job_id(widget_id: int) -> str:
    return f"widget_{widget_id}"


def schedule_widget(widget: Widget) -> None:
    """Add or replace the polling job for a widget, and fire an immediate poll."""
    jid = _job_id(widget.id)
    if scheduler.get_job(jid):
        scheduler.remove_job(jid)
    if widget.enabled:
        # First interval fire is deferred by poll_interval so it doesn't collide
        # with the immediate one-off poll below.
        first_run = datetime.now(timezone.utc) + timedelta(seconds=widget.poll_interval)
        scheduler.add_job(
            _poll_widget,
            "interval",
            seconds=widget.poll_interval,
            id=jid,
            args=[widget.id],
            max_instances=1,
            replace_existing=True,
            misfire_grace_time=120,
            next_run_time=first_run,
        )
        # Trigger an immediate poll so changes are reflected right away
        scheduler.add_job(_poll_widget, args=[widget.id], misfire_grace_time=30)


def unschedule_widget(widget_id: int) -> None:
    """Remove the polling job for a widget."""
    jid = _job_id(widget_id)
    if scheduler.get_job(jid):
        scheduler.remove_job(jid)


def start_scheduler() -> None:
    """Load all enabled widgets from DB and start the scheduler."""
    db: Session = SessionLocal()
    try:
        widgets = db.query(Widget).filter(Widget.enabled == True).all()  # noqa: E712
        for widget in widgets:
            schedule_widget(widget)
        scheduler.start()
        logger.info("Scheduler started with %d widget job(s)", len(widgets))
    finally:
        db.close()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
