import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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
]


def _run_migrations() -> None:
    with engine.connect() as conn:
        for table, column, col_def in _MIGRATIONS:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            existing = {row[1] for row in rows}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
                conn.commit()


def init_db():
    from backend import models  # noqa: F401 — ensures models are registered
    Base.metadata.create_all(bind=engine)
    _run_migrations()
