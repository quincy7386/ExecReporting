from sqlalchemy import Column, Integer, String, Boolean, Text
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
    enabled = Column(Boolean, nullable=False, default=True)
