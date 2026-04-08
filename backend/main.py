from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.database import init_db
from backend.routers import credentials, widgets, dashboards
from backend.scheduler import start_scheduler, stop_scheduler

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="ExecReporting", lifespan=lifespan)

app.include_router(credentials.router)
app.include_router(dashboards.router)
app.include_router(widgets.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve React frontend — must come after API routes
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        return FileResponse(STATIC_DIR / "index.html")
