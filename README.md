# RakshakWell — Personnel Welfare Intelligence

Prototype for **SIH Problem Statement 26186**: AI-Based Predictive Personnel Stress and Welfare Monitoring System for Uniformed Forces.

## Frontend
- React + Vite + lucide-react
- Welfare Officer / Commander / Personnel role context (demo)
- Personnel wellness dashboard and trends
- Voluntary wellness self-assessment
- Illustrative risk-signal calculation and explainable factors
- Early welfare alert workflow
- Human-led intervention and follow-up tracking
- Privacy, security, audit and demo session controls
- Unit welfare analytics and what-if scenario simulator
- Personnel welfare case file
- Guided SIH presentation walkthrough

## Backend
The prototype now includes an optional **FastAPI + SQLite** data layer:

```
Browser
  ↓
React + Vite
  ↓
FastAPI
  ↓
SQLite (demo)
  ↓
Personnel / Check-ins / Alerts / Interventions / Follow-ups
```

Backend endpoints include personnel records, check-ins, alerts, interventions, follow-up outcomes and unit analytics. See `backend/README.md`.

## Run frontend
```bash
npm install
npm run dev
```

## Run backend
Windows PowerShell:
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

## Prototype scope
The current frontend still works as a standalone demo. The backend is an optional prototype data/API layer and is not yet wired into every frontend action. Risk calculations are illustrative demo logic, not clinical validation, diagnosis, or autonomous personnel decisions. Production deployment would require secure authentication/authorization, consent controls, encrypted storage, audit logging, validated analytics/models, monitoring, and appropriate data governance.

## SIH demo positioning
The prototype demonstrates a workflow from voluntary self-reporting and organizational indicators to a reviewable welfare signal and human-led support action. It does not autonomously diagnose personnel or make disciplinary decisions.
