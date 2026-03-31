from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey
from datetime import datetime, timezone
from backend.database import Base


class Credentials(Base):
    __tablename__ = "credentials"

    id = Column(Integer, primary_key=True, default=1)
    hostname = Column(String, nullable=False)       # e.g. defense.conferdeploy.net
    org_key = Column(String, nullable=False)
    api_id = Column(String, nullable=False)
    api_secret_encrypted = Column(Text, nullable=False)  # Fernet-encrypted


class Widget(Base):
    __tablename__ = "widgets"

    id = Column(Integer, primary_key=True, autoincrement=True)
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
    time_range = Column(String, nullable=False, default="-2w")  # CBC relative range e.g. -1d, -1w, -2w, -30d
    enabled = Column(Boolean, nullable=False, default=True)


class WidgetCache(Base):
    __tablename__ = "widget_cache"

    widget_id = Column(Integer, ForeignKey("widgets.id", ondelete="CASCADE"), primary_key=True)
    data = Column(Text, nullable=True)       # JSON-encoded result
    error = Column(Text, nullable=True)      # last error message, if any
    last_updated = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
