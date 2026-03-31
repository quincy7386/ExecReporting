from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import Literal, Optional
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Widget, WidgetCache
from backend.scheduler import schedule_widget, unschedule_widget
import json

router = APIRouter(prefix="/api/widgets", tags=["widgets"])

ChartStyle = Literal["pie", "bar", "line", "list"]


DataSource = Literal["alerts", "devices", "observations", "process_search"]

class WidgetIn(BaseModel):
    title: str
    data_source: DataSource = "alerts"
    search_query: str
    group_by: str
    chart_style: ChartStyle
    poll_interval: int = 60
    time_range: str = "-2w"
    include_all_alerts: bool = False
    active_devices_only: bool = True
    row_limit: Optional[int] = None
    position_x: int = 0
    position_y: int = 0
    width: int = 4
    height: int = 3
    enabled: bool = True

    @field_validator("row_limit")
    @classmethod
    def row_limit_only_for_list(cls, v, info):
        if info.data.get("chart_style") != "list" and v is not None:
            raise ValueError("row_limit is only valid when chart_style is 'list'")
        return v


class WidgetOut(WidgetIn):
    id: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[WidgetOut])
def list_widgets(db: Session = Depends(get_db)):
    return db.query(Widget).all()


@router.get("/{widget_id}", response_model=WidgetOut)
def get_widget(widget_id: int, db: Session = Depends(get_db)):
    widget = db.get(Widget, widget_id)
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    return widget


@router.post("", response_model=WidgetOut, status_code=201)
def create_widget(body: WidgetIn, db: Session = Depends(get_db)):
    widget = Widget(**body.model_dump())
    db.add(widget)
    db.commit()
    db.refresh(widget)
    schedule_widget(widget)
    return widget


@router.put("/{widget_id}", response_model=WidgetOut)
def update_widget(widget_id: int, body: WidgetIn, db: Session = Depends(get_db)):
    widget = db.get(Widget, widget_id)
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    for key, value in body.model_dump().items():
        setattr(widget, key, value)
    db.commit()
    db.refresh(widget)
    schedule_widget(widget)
    return widget


@router.delete("/{widget_id}", status_code=204)
def delete_widget(widget_id: int, db: Session = Depends(get_db)):
    widget = db.get(Widget, widget_id)
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    unschedule_widget(widget_id)
    db.delete(widget)
    db.commit()


@router.get("/{widget_id}/data")
def get_widget_data(widget_id: int, db: Session = Depends(get_db)):
    """Return the latest cached poll result for a widget."""
    widget = db.get(Widget, widget_id)
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    cache = db.get(WidgetCache, widget_id)
    if not cache:
        return {"status": "pending", "data": None, "error": None, "last_updated": None}
    return {
        "status": "error" if cache.error else "ok",
        "data": json.loads(cache.data) if cache.data else None,
        "error": cache.error,
        "last_updated": cache.last_updated.isoformat() if cache.last_updated else None,
    }
