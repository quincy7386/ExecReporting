# CBC Reporting Dashboard

A self-hosted web application for visualizing Carbon Black Cloud data. Originally built as an executive reporting tool, it has grown into a comprehensive dashboard platform suitable for both executive leadership and SOC teams.

## Features

- **Multiple dashboards** with named, tabbed navigation
- **Six data sources**: Alerts, Devices, Observations (NGAV), Process Search (Enterprise EDR), Vulnerability Assessment, and Audit Logs
- **Four chart types**: Bar, Pie, Line (time-series), and List (table)
- **Time-series line charts** that bucket events over the selected time window, with optional split-by field for multi-series comparison (e.g. alert severity trends over time)
- **Aggregation support**: count, sum, avg, max, or min of any numeric field, grouped by any categorical field
- **MITRE ATT&CK enrichment**: T-codes in group-by results are automatically expanded with their technique name (including sub-techniques)
- **Clickable chart elements** that link directly to the relevant filtered view in the CBC UI
- **Drag-and-drop widget layout** with resizable cards
- **Background polling** with configurable intervals per widget
- **Move/copy widgets** between dashboards

## Architecture

| Layer | Technology |
|---|---|
| Backend API | Python, FastAPI |
| Database | SQLite (via SQLAlchemy) |
| Background jobs | APScheduler |
| CBC API client | httpx |
| Frontend | React 19, TypeScript, Vite |
| Charts | Recharts |
| Layout | react-grid-layout |

The backend serves the compiled React frontend as static files, so only one process needs to run in production.

## Requirements

- Python 3.11+
- Node.js 18+ (build only)

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

### 2. Frontend (build)

```bash
cd frontend
npm install
npm run build
```

The build output is placed in `backend/static/` and served automatically by FastAPI.

### 3. Run

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000` in your browser.

### 4. Development (frontend hot-reload)

Run the backend and frontend dev server simultaneously:

```bash
# Terminal 1
cd backend
uvicorn main:app --reload

# Terminal 2
cd frontend
npm run dev
```

The Vite dev server proxies `/api` requests to the backend automatically.

## Configuration

On first launch, navigate to **Settings** and enter your Carbon Black Cloud credentials:

| Field | Description |
|---|---|
| Hostname | Your CBC console hostname (e.g. `defense-prod05.conferdeploy.net`) |
| Org Key | Your organization key |
| API ID | API credential ID |
| API Secret | API credential secret |

Credentials are encrypted at rest using Fernet symmetric encryption. The encryption key is generated automatically on first run and stored in `data/secret.key`.

## Data

The SQLite database and encryption key are stored in the `data/` directory, which is created automatically on first run. Back this directory up to preserve your dashboards and credentials.

## Data Sources

| Source | Notes |
|---|---|
| **Alerts** | Supports open-only filter; time range applies |
| **Devices** | Supports active-only filter; no time range |
| **Observations** | NGAV events; async job-based API |
| **Process Search** | Enterprise EDR; async job-based API; requires EDR license |
| **Vulnerability Assessment** | Device vulnerability inventory; no time range |
| **Audit Logs** | CBC platform admin activity |

## Widget Configuration

Each widget has:

- **Data source** and **search query** (CBC search syntax)
- **Group by field** — the field whose values form the chart categories or list rows
- **Chart style** — Bar, Pie, Line, or List
- **Time range** — applies to Alerts, Observations, Process Search, and Audit Logs
- **Aggregate function** — count (default), sum, avg, max, or min of a numeric field
- **Poll interval** — how frequently the backend re-fetches data from CBC
- **Split by field** (Line charts only) — plots a separate line per value of this field, up to 6 series
