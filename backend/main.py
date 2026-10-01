from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import mimetypes
import secrets
import json
import re
import os

from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None
try:
    import pytesseract
    from PIL import Image, ImageOps, ImageFilter
except Exception:
    pytesseract = None
    Image = ImageOps = ImageFilter = None

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "rakshakwell.db"
UPLOAD_DIR = BASE_DIR / "uploads" / "medical_reports"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="RakshakWell API",
    version="0.1.0",
    description="Demo welfare-support API for SIH PS 26186. Not a clinical or validated predictive system.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
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
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL,
      action TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demo_users (
      username TEXT PRIMARY KEY, role TEXT NOT NULL, password TEXT NOT NULL, person_id TEXT
    );
    CREATE TABLE IF NOT EXISTS medical_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL,
      original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE,
      content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, analysis TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, username TEXT NOT NULL, role TEXT NOT NULL, person_id TEXT, created_at TEXT NOT NULL
    );
    """)
    report_cols={r["name"] for r in conn.execute("PRAGMA table_info(medical_reports)").fetchall()}
    if "analysis" not in report_cols:
        conn.execute("ALTER TABLE medical_reports ADD COLUMN analysis TEXT")
    if conn.execute("SELECT COUNT(*) AS n FROM personnel").fetchone()["n"] == 0:
        seed = seed_personnel_rows()
        conn.executemany("INSERT INTO personnel VALUES (?,?,?,?,?,?,?,?,?,?)", seed)
    users = [
      ("welfare.demo", "Welfare Officer", "welfare123", None),
      ("commander.demo", "Commander", "command123", None),
      ("personnel.demo", "Personnel", "personnel123", "CR-1042"),
    ]
    conn.executemany("INSERT OR REPLACE INTO demo_users(username,role,password,person_id) VALUES (?,?,?,?)", users)
    conn.commit()
    conn.close()

@app.on_event("startup")
def startup():
    init_db()

class LoginIn(BaseModel):
    username: str
    password: str

class SessionOut(BaseModel):
    token: str
    username: str
    role: str
    person_id: str | None = None

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

class AuditEventIn(BaseModel):
    role: str = "Welfare Officer"
    action: str

VALID_ROLES = {"Welfare Officer", "Commander", "Personnel"}
DEMO_PERSON_ID = "CR-1042"

def session_context(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authenticated session required")
    token = authorization.split(" ", 1)[1].strip()
    conn = connect()
    row = conn.execute("SELECT username,role,person_id FROM sessions WHERE token=?", (token,)).fetchone()
    conn.close()
    if not row: raise HTTPException(401, "Invalid or expired session")
    return dict(row)

def require_role(role: str | None, allowed: set[str], authorization: str | None = None):
    ctx = session_context(authorization)
    if role != ctx["role"] or role not in VALID_ROLES: raise HTTPException(403, "Session role mismatch")
    if role not in allowed: raise HTTPException(403, "Role is not authorized for this action")
    return ctx

def require_person_scope(person_id: str, role: str | None, authorization: str | None = None):
    ctx = require_role(role, {"Welfare Officer", "Personnel"}, authorization)
    if role == "Personnel" and person_id != ctx["person_id"]: raise HTTPException(403, "Personnel can access only their own record")
    return ctx

@app.post("/api/auth/login", response_model=SessionOut)
def login(data: LoginIn):
    conn=connect()
    row=conn.execute("SELECT username,role,password,person_id FROM demo_users WHERE username=?", (data.username.strip(),)).fetchone()
    if not row or not secrets.compare_digest(row["password"], data.password):
        conn.close()
        raise HTTPException(401, "Invalid demo credentials")
    token=secrets.token_urlsafe(32)
    conn.execute("INSERT INTO sessions(token,username,role,person_id,created_at) VALUES (?,?,?,?,?)",(token,row["username"],row["role"],row["person_id"],now()))
    conn.commit(); conn.close()
    return {"token":token,"username":row["username"],"role":row["role"],"person_id":row["person_id"]}

@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    session_context(authorization)
    token=authorization.split(" ",1)[1].strip()
    conn=connect(); conn.execute("DELETE FROM sessions WHERE token=?",(token,)); conn.commit(); conn.close()
    return {"ok":True}

@app.get("/api/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
    return session_context(authorization)

def seed_personnel_rows():
    return [
      ("CR-1042","A. Sharma","Alpha Unit","High-intensity",2,9,62,"Elevated","Today",8),
      ("CR-1187","R. Singh","Bravo Unit","Routine",5,7,81,"Low","Yesterday",11),
      ("CR-1214","V. Kumar","Charlie Unit","Extended",1,11,48,"High","Today",7),
      ("CR-1321","P. Verma","Delta Unit","Routine",4,8,76,"Low","2 days ago",10)
    ]


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

ALLOWED_REPORT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_REPORT_SIZE = 10 * 1024 * 1024

def extract_report_text(content_type: str, raw: bytes):
    if content_type == "application/pdf" and PdfReader:
        try:
            from io import BytesIO
            reader = PdfReader(BytesIO(raw))
            return "\n".join((page.extract_text() or "") for page in reader.pages), "PDF text extraction"
        except Exception:
            return "", "PDF text extraction failed"
    if content_type in {"image/jpeg", "image/png"} and pytesseract and Image:
        try:
            from io import BytesIO
            image = Image.open(BytesIO(raw)).convert("L")
            image = ImageOps.autocontrast(image)
            image = image.resize((image.width * 2, image.height * 2))
            image = image.filter(ImageFilter.SHARPEN)
            text = pytesseract.image_to_string(image, config="--psm 6")
            return text, "OCR (Tesseract)"
        except Exception:
            return "", "Image OCR failed"
    return "", "OCR dependency unavailable"

def build_report_analysis(original_name: str, content_type: str, raw: bytes):
    text, method = extract_report_text(content_type, raw)
    cleaned = re.sub(r"\s+", " ", text).strip()
    lower = cleaned.lower()
    findings = []
    patterns = [
        (r"blood pressure|\bbp\b", "Blood-pressure information detected."),
        (r"hemoglobin|\bhb\b", "Hemoglobin-related information detected."),
        (r"glucose|blood sugar|\bsugar\b", "Glucose/blood-sugar information detected."),
        (r"cholesterol|ldl|hdl", "Cholesterol/lipid information detected."),
        (r"thyroid|tsh|t3|t4", "Thyroid-related information detected."),
        (r"vitamin|b12|vitamin d", "Vitamin-related information detected."),
        (r"medication|tablet|capsule|prescription", "Medication information detected."),
        (r"diagnosis|impression|clinical impression", "Diagnosis/impression section detected."),
        (r"cbc|complete blood count|wbc|platelet", "CBC/blood-count information detected."),
        (r"creatinine|urea|kidney", "Kidney-function information detected."),
        (r"liver|sgot|sgpt|bilirubin", "Liver-function information detected.")
    ]
    for pattern, message in patterns:
        if re.search(pattern, lower) and message not in findings:
            findings.append(message)
    if cleaned:
        conclusion = ("The report was successfully processed and readable clinical information was detected. "
                      "The system identified the topics shown below for review. Values and clinical meaning should "
                      "be verified against the original report by a qualified healthcare professional.")
        status = "ready"
    else:
        conclusion = ("The report was uploaded, but readable content could not be extracted. "
                      "Please upload a clearer scan or text-based PDF. No clinical conclusion was generated.")
        status = "needs_review"
    return {"status":status,"title":original_name,"extraction":method,"findings":findings[:8],
            "conclusion":conclusion,"text_preview":cleaned[:1400],
            "disclaimer":"Prototype-only informational summary. It does not diagnose conditions, prescribe treatment, or replace professional medical review."}


@app.get("/api/my-medical-reports")
def list_my_medical_reports(x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    ctx = require_role(x_demo_role, {"Personnel"}, authorization)
    conn = connect()
    rows = [dict(r) for r in conn.execute(
        "SELECT id,original_name,content_type,size_bytes,created_at,analysis FROM medical_reports WHERE person_id=? ORDER BY id DESC",
        (ctx["person_id"],))]
    conn.close()
    for row in rows: row["analysis"] = json.loads(row["analysis"]) if row.get("analysis") else None
    return rows

@app.post("/api/my-medical-reports")
async def upload_my_medical_report(file: UploadFile = File(...), x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    ctx = require_role(x_demo_role, {"Personnel"}, authorization)
    if file.content_type not in ALLOWED_REPORT_TYPES: raise HTTPException(400, "Only PDF, JPG and PNG files are supported")
    raw = await file.read()
    if len(raw) > MAX_REPORT_SIZE: raise HTTPException(413, "File size must be 10 MB or less")
    safe_name = Path(file.filename or "medical_report").name
    stored_name = f"{secrets.token_hex(16)}_{safe_name}"
    (UPLOAD_DIR / stored_name).write_bytes(raw)
    analysis = build_report_analysis(safe_name, file.content_type, raw)
    conn = connect()
    cur = conn.execute("INSERT INTO medical_reports(person_id,original_name,stored_name,content_type,size_bytes,created_at,analysis) VALUES (?,?,?,?,?,?,?)",
        (ctx["person_id"],safe_name,stored_name,file.content_type,len(raw),now(),json.dumps(analysis)))
    conn.commit()
    row = conn.execute("SELECT id,original_name,content_type,size_bytes,created_at,analysis FROM medical_reports WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    result = dict(row); result["analysis"] = json.loads(result["analysis"])
    return result

@app.get("/api/my-medical-reports/{report_id}/download")
def download_my_medical_report(report_id:int, x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    ctx = require_role(x_demo_role, {"Personnel"}, authorization)
    conn = connect()
    row = conn.execute("SELECT * FROM medical_reports WHERE id=? AND person_id=?", (report_id,ctx["person_id"])).fetchone()
    conn.close()
    if not row: raise HTTPException(404,"Report not found")
    path = UPLOAD_DIR / row["stored_name"]
    if not path.exists(): raise HTTPException(404,"Stored report file not found")
    return FileResponse(path,media_type=row["content_type"],filename=row["original_name"])

@app.delete("/api/my-medical-reports/{report_id}")
def delete_my_medical_report(report_id:int, x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    ctx = require_role(x_demo_role, {"Personnel"}, authorization)
    conn=connect()
    row=conn.execute("SELECT stored_name FROM medical_reports WHERE id=? AND person_id=?",(report_id,ctx["person_id"])).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Report not found")
    conn.execute("DELETE FROM medical_reports WHERE id=? AND person_id=?",(report_id,ctx["person_id"])); conn.commit(); conn.close()
    path=UPLOAD_DIR/row["stored_name"]
    if path.exists(): path.unlink()
    return {"ok":True}

@app.get("/health")
def health():
    return {"status":"ok","service":"rakshakwell-api","demo":True}

@app.get("/api/audit-events")
def list_audit_events(x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_role(x_demo_role, {"Welfare Officer", "Commander"}, authorization)
    conn = connect()
    rows = [dict(r) for r in conn.execute("SELECT * FROM audit_events ORDER BY id DESC LIMIT 50")]
    conn.close()
    return rows

@app.post("/api/audit-events")
def create_audit_event(data: AuditEventIn, x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_role(x_demo_role, {"Welfare Officer", "Commander"}, authorization)
    data.role = x_demo_role
    conn = connect()
    cur = conn.execute(
      "INSERT INTO audit_events(role,action,created_at) VALUES (?,?,?)",
      (data.role, data.action, now())
    )
    conn.commit()
    row = conn.execute("SELECT * FROM audit_events WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)

@app.get("/api/personnel")
def list_personnel(x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_role(x_demo_role, {"Welfare Officer", "Commander", "Personnel"}, authorization)
    conn=connect()
    if x_demo_role == "Commander":
        rows=[dict(r) for r in conn.execute("SELECT unit,unit AS id,'Unit aggregate' AS name,'Aggregated' AS deployment,ROUND(AVG(leave),1) AS leave,ROUND(AVG(duty),1) AS duty,ROUND(AVG(wellness),0) AS wellness,CASE WHEN SUM(CASE WHEN risk='High' THEN 1 ELSE 0 END)>0 THEN 'High' WHEN SUM(CASE WHEN risk='Elevated' THEN 1 ELSE 0 END)>0 THEN 'Elevated' ELSE 'Low' END AS risk,'Aggregated' AS last,COUNT(*) AS checkins FROM personnel GROUP BY unit ORDER BY unit")]
    elif x_demo_role == "Personnel":
        rows=[dict(r) for r in conn.execute("SELECT * FROM personnel WHERE id=?", (DEMO_PERSON_ID,))]
    else:
        rows=[dict(r) for r in conn.execute("SELECT * FROM personnel ORDER BY id")]
    conn.close()
    return rows

@app.get("/api/personnel/{person_id}")
def get_personnel(person_id: str, x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_person_scope(person_id, x_demo_role, authorization)
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
def create_checkin(data: CheckinIn, x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_person_scope(data.person_id, x_demo_role, authorization)
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
def list_alerts(x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_role(x_demo_role, {"Welfare Officer", "Commander"}, authorization)
    if x_demo_role == "Commander":
        conn=connect()
        rows=[dict(r) for r in conn.execute("SELECT id,risk,status,created_at FROM alerts ORDER BY id DESC")]
        conn.close()
        return rows
    conn=connect()
    rows=[dict(r) for r in conn.execute("SELECT * FROM alerts ORDER BY id DESC")]
    conn.close()
    return rows

@app.post("/api/alerts/{alert_id}/review")
def review_alert(alert_id:int,data:ReviewIn,x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_role(x_demo_role, {"Welfare Officer"}, authorization)
    data.role = x_demo_role
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
def list_interventions(x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_role(x_demo_role, {"Welfare Officer", "Commander"}, authorization)
    if x_demo_role == "Commander": return []
    conn=connect()
    rows=[dict(r) for r in conn.execute("SELECT * FROM interventions ORDER BY id DESC")]
    conn.close()
    return rows

@app.post("/api/interventions")
def create_intervention(data:InterventionIn,x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_person_scope(data.person_id, x_demo_role, authorization)
    conn=connect()
    cur=conn.execute(
      "INSERT INTO interventions(person_id,name,action,created_at) VALUES (?,?,?,?)",
      (data.person_id,data.name,data.action,now()))
    conn.commit()
    row=conn.execute("SELECT * FROM interventions WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)

@app.post("/api/followups")
def create_followup(data:FollowupIn,x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_person_scope(data.person_id, x_demo_role, authorization)
    conn=connect()
    cur=conn.execute(
      "INSERT INTO followups(person_id,name,action,created_at) VALUES (?,?,?,?)",
      (data.person_id,data.name,data.action,now()))
    conn.commit()
    row=conn.execute("SELECT * FROM followups WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)

@app.get("/api/followups")
def list_followups(x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_role(x_demo_role, {"Welfare Officer", "Commander"}, authorization)
    if x_demo_role == "Commander": return []
    conn=connect()
    rows=[dict(r) for r in conn.execute("SELECT * FROM followups ORDER BY id DESC")]
    conn.close()
    return rows

@app.post("/api/followups/{followup_id}/outcome")
def followup_outcome(followup_id:int,data:FollowupOutcomeIn,x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_role(x_demo_role, {"Welfare Officer"}, authorization)
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

@app.post("/api/demo/reset")
def reset_demo():
    conn = connect()
    conn.execute("DELETE FROM checkins")
    conn.execute("DELETE FROM alerts")
    conn.execute("DELETE FROM interventions")
    conn.execute("DELETE FROM followups")
    conn.execute("DELETE FROM audit_events")
    conn.execute("DELETE FROM personnel")
    conn.executemany("INSERT INTO personnel VALUES (?,?,?,?,?,?,?,?,?,?)", seed_personnel_rows())
    conn.commit()
    personnel = [dict(r) for r in conn.execute("SELECT * FROM personnel ORDER BY id")]
    conn.close()
    return {"personnel": personnel, "alerts": [], "interventions": [], "followups": [], "demo": True}


@app.get("/api/analytics/units")
def unit_analytics(x_demo_role: str | None = Header(default=None), authorization: str | None = Header(default=None)):
    require_role(x_demo_role, {"Welfare Officer", "Commander"})
    conn=connect()
    rows=conn.execute(
      "SELECT unit,ROUND(AVG(wellness),0) AS average_wellness,ROUND(AVG(duty),1) AS average_duty_hours,SUM(CASE WHEN risk!='Low' THEN 1 ELSE 0 END) AS attention_signals FROM personnel GROUP BY unit ORDER BY unit"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
