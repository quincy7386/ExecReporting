from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI(title="ExecReporting")

# TODO: mount routers here

@app.get("/api/health")
def health():
    return {"status": "ok"}
