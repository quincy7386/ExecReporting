"""
Widget polling scheduler using APScheduler.

Each enabled widget gets a job that fires on its poll_interval.
Jobs fetch data from CBC and write to widget_cache.
The scheduler is started/stopped via the FastAPI lifespan.
"""
import json
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import Credentials, Widget, WidgetCache
from backend.cbc_client import fetch_list, fetch_chart, fetch_devices_list, fetch_devices_chart

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


# ---------------------------------------------------------------------------
# Job function
# ---------------------------------------------------------------------------

async def _poll_widget(widget_id: int) -> None:
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
            if widget.data_source == "devices":
                query = widget.search_query
                if widget.active_devices_only:
                    query = "status:ACTIVE" if query.strip() in ("", "*") else f"({query}) AND status:ACTIVE"
                if widget.chart_style == "list":
                    result = await fetch_devices_list(creds, query, widget.row_limit or 25)
                else:
                    result = await fetch_devices_chart(creds, query, widget.group_by)
            else:
                query = widget.search_query
                if not widget.include_all_alerts:
                    query = f"({query}) AND workflow_status:OPEN"
                if widget.chart_style == "list":
                    result = await fetch_list(creds, query, widget.row_limit or 25, widget.time_range)
                else:
                    result = await fetch_chart(creds, query, widget.group_by, widget.time_range)

            _write_cache(db, widget_id, data=json.dumps(result), error=None)
            logger.info("Polled widget %d OK", widget_id)

        except Exception as e:
            logger.warning("Widget %d poll error: %s", widget_id, e)
            _write_cache(db, widget_id, data=None, error=str(e))

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
        scheduler.add_job(
            _poll_widget,
            "interval",
            seconds=widget.poll_interval,
            id=jid,
            args=[widget.id],
            max_instances=1,
            replace_existing=True,
        )
        # Trigger an immediate poll so changes are reflected right away
        scheduler.add_job(_poll_widget, args=[widget.id])


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
