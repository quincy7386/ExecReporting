from contextlib import asynccontextmanager
from fastapi import FastAPI
from backend.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ExecReporting", lifespan=lifespan)

# TODO: mount routers here

@app.get("/api/health")
def health():
    return {"status": "ok"}
