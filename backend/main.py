from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "rakshakwell.db"

app = FastAPI(
    title="RakshakWell API",
    version="0.1.0",
    description="Demo welfare-support API for SIH PS 26186. Not a clinical or validated predictive system.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def now():
    return datetime.now(timezone.utc).isoformat()

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = connect()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS personnel (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL,
      deployment TEXT NOT NULL, leave INTEGER NOT NULL, duty INTEGER NOT NULL,
      wellness INTEGER NOT NULL, risk TEXT NOT NULL, last TEXT NOT NULL, checkins INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL,
      wellness INTEGER NOT NULL, risk TEXT NOT NULL, sleep INTEGER, mood INTEGER,
      energy INTEGER, workload INTEGER, concern TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL, name TEXT NOT NULL,
      risk TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open',
      reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interventions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL, name TEXT NOT NULL,
      action TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Planned', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL, name TEXT NOT NULL,
      action TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending',
      outcome TEXT NOT NULL DEFAULT 'Awaiting follow-up', created_at TEXT NOT NULL
    );
    """)
    if conn.execute("SELECT COUNT(*) AS n FROM personnel").fetchone()["n"] == 0:
        seed = [
          ("CR-1042","A. Sharma","Alpha Unit","High-intensity",2,9,62,"Elevated","Today",8),
          ("CR-1187","R. Singh","Bravo Unit","Routine",5,7,81,"Low","Yesterday",11),
          ("CR-1214","V. Kumar","Charlie Unit","Extended",1,11,48,"High","Today",7),
          ("CR-1321","P. Verma","Delta Unit","Routine",4,8,76,"Low","2 days ago",10)
        ]
        conn.executemany("INSERT INTO personnel VALUES (?,?,?,?,?,?,?,?,?,?)", seed)
    conn.commit()
    conn.close()

@app.on_event("startup")
def startup():
    init_db()

class CheckinIn(BaseModel):
    person_id: str = "CR-1042"
    sleep: int = Field(ge=1, le=5)
    mood: int = Field(ge=1, le=5)
    energy: int = Field(ge=1, le=5)
    workload: int = Field(ge=1, le=5)
    concern: str = ""

class ReviewIn(BaseModel):
    role: str = "Welfare Officer"

class InterventionIn(BaseModel):
    person_id: str
    name: str
    action: str

class FollowupIn(BaseModel):
    person_id: str
    name: str
    action: str

class FollowupOutcomeIn(BaseModel):
    outcome: str

def risk_from_score(wellness):
    if wellness <= 40: return "High"
    if wellness <= 65: return "Elevated"
    return "Low"

def calculate_wellness(data, person):
    points = (
      ((6-data.sleep)/5)*22 + ((6-data.mood)/5)*22 + ((6-data.energy)/5)*16
      + (data.workload/5)*18 + (max(0,person["duty"]-8)/5)*12
      + (max(0,3-person["leave"])/5)*6
      + ((2 if person["deployment"]=="Extended" else 1 if person["deployment"]=="High-intensity" else 0)/5)*4
    )
    return round(max(0, min(100, 100-points)))

@app.get("/health")
def health():
    return {"status":"ok","service":"rakshakwell-api","demo":True}

@app.get("/api/personnel")
def list_personnel():
    conn=connect()
    rows=[dict(r) for r in conn.execute("SELECT * FROM personnel ORDER BY id")]
    conn.close()
    return rows

@app.get("/api/personnel/{person_id}")
def get_personnel(person_id: str):
    conn=connect()
    row=conn.execute("SELECT * FROM personnel WHERE id=?", (person_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404,"Personnel record not found")
    history=[dict(r) for r in conn.execute(
      "SELECT created_at AS date, wellness, risk FROM checkins WHERE person_id=? ORDER BY id DESC LIMIT 5",
      (person_id,))]
    conn.close()
    result=dict(row)
    result["history"]=list(reversed(history))
    return result

@app.post("/api/checkins")
def create_checkin(data: CheckinIn):
    conn=connect()
    person=conn.execute("SELECT * FROM personnel WHERE id=?", (data.person_id,)).fetchone()
    if not person:
        conn.close()
        raise HTTPException(404,"Personnel record not found")
    wellness=calculate_wellness(data,person)
    risk=risk_from_score(wellness)
    timestamp=now()
    conn.execute(
      "INSERT INTO checkins(person_id,wellness,risk,sleep,mood,energy,workload,concern,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      (data.person_id,wellness,risk,data.sleep,data.mood,data.energy,data.workload,data.concern,timestamp))
    conn.execute(
      "UPDATE personnel SET wellness=?,risk=?,last=?,checkins=checkins+1 WHERE id=?",
      (wellness,risk,"Just now",data.person_id))
    alert_id=None
    if risk!="Low":
        cur=conn.execute(
          "INSERT INTO alerts(person_id,name,risk,reason,created_at) VALUES (?,?,?,?,?)",
          (data.person_id,person["name"],risk,"Wellness check-in signal",timestamp))
        alert_id=cur.lastrowid
    conn.commit()
    conn.close()
    return {"wellness":wellness,"risk":risk,"alert_id":alert_id,"created_at":timestamp,"demo":True}

@app.get("/api/alerts")
def list_alerts():
    conn=connect()
    rows=[dict(r) for r in conn.execute("SELECT * FROM alerts ORDER BY id DESC")]
    conn.close()
    return rows

@app.post("/api/alerts/{alert_id}/review")
def review_alert(alert_id:int,data:ReviewIn):
    conn=connect()
    cur=conn.execute(
      "UPDATE alerts SET status='Reviewed',reviewed_by=?,reviewed_at=? WHERE id=?",
      (data.role,now(),alert_id))
    if cur.rowcount==0:
        conn.close()
        raise HTTPException(404,"Alert not found")
    conn.commit()
    row=conn.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
    conn.close()
    return dict(row)

@app.get("/api/interventions")
def list_interventions():
    conn=connect()
    rows=[dict(r) for r in conn.execute("SELECT * FROM interventions ORDER BY id DESC")]
    conn.close()
    return rows

@app.post("/api/interventions")
def create_intervention(data:InterventionIn):
    conn=connect()
    cur=conn.execute(
      "INSERT INTO interventions(person_id,name,action,created_at) VALUES (?,?,?,?)",
      (data.person_id,data.name,data.action,now()))
    conn.commit()
    row=conn.execute("SELECT * FROM interventions WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)

@app.post("/api/followups")
def create_followup(data:FollowupIn):
    conn=connect()
    cur=conn.execute(
      "INSERT INTO followups(person_id,name,action,created_at) VALUES (?,?,?,?)",
      (data.person_id,data.name,data.action,now()))
    conn.commit()
    row=conn.execute("SELECT * FROM followups WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)

@app.get("/api/followups")
def list_followups():
    conn=connect()
    rows=[dict(r) for r in conn.execute("SELECT * FROM followups ORDER BY id DESC")]
    conn.close()
    return rows

@app.post("/api/followups/{followup_id}/outcome")
def followup_outcome(followup_id:int,data:FollowupOutcomeIn):
    if data.outcome not in {"Improved","Stable","Further review required"}:
        raise HTTPException(400,"Invalid follow-up outcome")
    conn=connect()
    cur=conn.execute(
      "UPDATE followups SET status='Completed',outcome=? WHERE id=?",
      (data.outcome,followup_id))
    if cur.rowcount==0:
        conn.close()
        raise HTTPException(404,"Follow-up not found")
    conn.commit()
    row=conn.execute("SELECT * FROM followups WHERE id=?", (followup_id,)).fetchone()
    conn.close()
    return dict(row)

@app.get("/api/analytics/units")
def unit_analytics():
    conn=connect()
    rows=conn.execute(
      "SELECT unit,ROUND(AVG(wellness),0) AS average_wellness,ROUND(AVG(duty),1) AS average_duty_hours,SUM(CASE WHEN risk!='Low' THEN 1 ELSE 0 END) AS attention_signals FROM personnel GROUP BY unit ORDER BY unit"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
