from contextlib import asynccontextmanager
from fastapi import FastAPI
from backend.database import init_db
from backend.routers import credentials, widgets


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ExecReporting", lifespan=lifespan)

app.include_router(credentials.router)
app.include_router(widgets.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
