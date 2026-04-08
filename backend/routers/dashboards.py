from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.database import get_db
from backend.models import Dashboard, Widget

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


class DashboardIn(BaseModel):
    name: str
    position: int = 0


class DashboardOut(DashboardIn):
    id: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[DashboardOut])
def list_dashboards(db: Session = Depends(get_db)):
    return db.query(Dashboard).order_by(Dashboard.position, Dashboard.id).all()


@router.post("", response_model=DashboardOut, status_code=201)
def create_dashboard(body: DashboardIn, db: Session = Depends(get_db)):
    dashboard = Dashboard(**body.model_dump())
    db.add(dashboard)
    db.commit()
    db.refresh(dashboard)
    return dashboard


@router.put("/{dashboard_id}", response_model=DashboardOut)
def update_dashboard(dashboard_id: int, body: DashboardIn, db: Session = Depends(get_db)):
    dashboard = db.get(Dashboard, dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    for key, value in body.model_dump().items():
        setattr(dashboard, key, value)
    db.commit()
    db.refresh(dashboard)
    return dashboard


@router.delete("/{dashboard_id}", status_code=204)
def delete_dashboard(dashboard_id: int, db: Session = Depends(get_db)):
    total = db.query(Dashboard).count()
    if total <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last dashboard")
    dashboard = db.get(Dashboard, dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    # Reassign widgets to the first remaining dashboard
    remaining = db.query(Dashboard).filter(Dashboard.id != dashboard_id).order_by(Dashboard.position, Dashboard.id).first()
    db.query(Widget).filter(Widget.dashboard_id == dashboard_id).update({"dashboard_id": remaining.id})
    db.delete(dashboard)
    db.commit()
