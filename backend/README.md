# RakshakWell Backend

FastAPI + SQLite demo backend for SIH PS 26186.

## Run locally

Windows PowerShell:
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open http://127.0.0.1:8000/docs.

## API

- GET /health
- GET /api/personnel
- GET /api/personnel/{id}
- POST /api/checkins
- GET /api/alerts
- POST /api/alerts/{id}/review
- GET /api/interventions
- POST /api/interventions
- POST /api/followups/{id}/outcome
- GET /api/analytics/units

SQLite is created automatically as backend/rakshakwell.db.

This is a prototype data/API layer. Risk calculations are illustrative demo logic, not clinical validation, diagnosis, or autonomous personnel decisions.
