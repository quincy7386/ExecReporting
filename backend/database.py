import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")

# NullPool: each Session opens/closes its own connection directly.
# SQLite connections are file-based and cheap; pooling only adds limits
# and contention when many async poll jobs run concurrently.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=NullPool)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Each entry: (table, column, column_def)
# Add a row here whenever a new column is added to an existing table.
_MIGRATIONS = [
    ("widgets", "time_range", "VARCHAR NOT NULL DEFAULT '-2w'"),
    ("widgets", "include_all_alerts", "BOOLEAN NOT NULL DEFAULT 0"),
    ("widgets", "data_source", "VARCHAR NOT NULL DEFAULT 'alerts'"),
    ("widgets", "active_devices_only", "BOOLEAN NOT NULL DEFAULT 1"),
    ("widgets", "sort_order", "VARCHAR NOT NULL DEFAULT 'desc'"),
    ("widgets", "list_columns", "TEXT"),
    ("widgets", "agg_field", "VARCHAR"),
    ("widgets", "agg_func", "VARCHAR NOT NULL DEFAULT 'count'"),
    ("widgets", "line_split_by", "VARCHAR"),
    ("widgets", "dashboard_id", "INTEGER"),
    ("widgets", "bar_split_by", "VARCHAR"),
]


def _run_migrations() -> None:
    with engine.connect() as conn:
        for table, column, col_def in _MIGRATIONS:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            existing = {row[1] for row in rows}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
                conn.commit()


def _seed_default_dashboard() -> None:
    """Ensure at least one dashboard exists; migrate orphan widgets to it."""
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM dashboards")).scalar()
        if count == 0:
            conn.execute(text("INSERT INTO dashboards (name, position) VALUES ('Dashboard', 0)"))
            conn.commit()
        default_id = conn.execute(text("SELECT id FROM dashboards ORDER BY position, id LIMIT 1")).scalar()
        conn.execute(text(f"UPDATE widgets SET dashboard_id = {default_id} WHERE dashboard_id IS NULL"))
        conn.commit()


def init_db():
    from backend import models  # noqa: F401 — ensures models are registered
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    _seed_default_dashboard()
