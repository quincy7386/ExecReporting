from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey, JSON
from datetime import datetime, timezone
from backend.database import Base


class Credentials(Base):
    __tablename__ = "credentials"

    id = Column(Integer, primary_key=True, default=1)
    hostname = Column(String, nullable=False)       # e.g. defense.conferdeploy.net
    org_key = Column(String, nullable=False)
    api_id = Column(String, nullable=False)
    api_secret_encrypted = Column(Text, nullable=False)  # Fernet-encrypted


class Dashboard(Base):
    __tablename__ = "dashboards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, default="Dashboard")
    position = Column(Integer, nullable=False, default=0)


class Widget(Base):
    __tablename__ = "widgets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id"), nullable=True)
    title = Column(String, nullable=False)
    search_query = Column(Text, nullable=False)     # CBC search syntax
    group_by = Column(String, nullable=False)
    chart_style = Column(String, nullable=False)    # pie | bar | line | list
    poll_interval = Column(Integer, nullable=False, default=60)  # seconds
    row_limit = Column(Integer, nullable=True)      # only used for chart_style=list
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    width = Column(Integer, nullable=False, default=4)
    height = Column(Integer, nullable=False, default=3)
    data_source = Column(String, nullable=False, default="alerts")  # alerts | devices | observations | process_search | vulnerability_assessment
    time_range = Column(String, nullable=False, default="-2w")
    include_all_alerts = Column(Boolean, nullable=False, default=False)  # alerts only; False = OPEN only
    active_devices_only = Column(Boolean, nullable=False, default=True)  # devices only; True = ACTIVE only
    sort_order = Column(String, nullable=False, default="desc")  # asc | desc
    list_columns = Column(JSON, nullable=True)  # ordered list of column names to display; null/[] = show all
    agg_field = Column(String, nullable=True)   # field to aggregate; null = record count
    agg_func = Column(String, nullable=False, default="count")  # count | sum | avg | max | min
    line_split_by = Column(String, nullable=True)  # line chart only: field to split into multiple series
    bar_split_by = Column(String, nullable=True)   # bar chart only: field to split segments by
    bar_group_style = Column(String, nullable=False, default="stacked")  # stacked | grouped
    enabled = Column(Boolean, nullable=False, default=True)


class WidgetCache(Base):
    __tablename__ = "widget_cache"

    widget_id = Column(Integer, ForeignKey("widgets.id", ondelete="CASCADE"), primary_key=True)
    data = Column(Text, nullable=True)       # JSON-encoded result
    error = Column(Text, nullable=True)      # last error message, if any
    last_updated = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
