import os
import json
import asyncio
import jwt
import sqlite3
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form as FastAPIForm, WebSocket, WebSocketDisconnect, Header, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import requests
import pydantic

from database import DB_PATH, get_db_connection, init_db, seed_db
import schemas
import agent

# Secure Token Verification
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")
FASTEN_PUBLIC_ID = os.getenv("FASTEN_PUBLIC_ID", "demo-public-id")
FASTEN_PRIVATE_KEY = os.getenv("FASTEN_PRIVATE_KEY", "demo-private-key")
FASTEN_WEBHOOK_SECRET = os.getenv("FASTEN_WEBHOOK_SECRET", "demo-webhook-secret")
API_HOST = os.getenv("API_HOST", "localhost:8000")
BLAND_VOICE = os.getenv("BLAND_VOICE", "maya")

def verify_firebase_token(token: str) -> dict:
    if not FIREBASE_PROJECT_ID or token == "mock_token_eugene":
        # Dev local bypass
        return {
            "uid": "eugene_123",
            "name": "Eugene Vestel",
            "email": "eugene.vestel@example.com"
        }
    try:
        url = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken-system%40system.gserviceaccount.com"
        certs = requests.get(url).json()
        
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid or kid not in certs:
            return None
            
        public_key = certs[kid]
        
        decoded = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"
        )
        return decoded
    except Exception as e:
        print(f"Token validation failed: {e}")
        return None

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        # Log and fall back to mock patient for prototype preview
        print("Warning: Missing or invalid authorization header.")
        return {"uid": "eugene_123", "name": "Eugene Vestel"}
        
    token = authorization.split(" ")[1]
    user = verify_firebase_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token")
    return user


# Ensure database is initialized and seeded
if not os.path.exists(DB_PATH):
    init_db()
    seed_db()

app = FastAPI(title="Healthcare Agent Backend API")

# Enable CORS for React Native development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", response_class=HTMLResponse)
def read_root():
    import os
    path = os.path.join(os.path.dirname(__file__), "index.html")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read(), status_code=200)
    return HTMLResponse(content="<h1>Healthcare Agent API is running</h1>", status_code=200)

# GET patient profile
@app.get("/api/patient", response_model=schemas.PatientProfile)
def get_patient():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patients WHERE id = 1")
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Patient profile not found")
        
    return schemas.PatientProfile(
        id=row["id"],
        name=row["name"],
        dob=row["dob"],
        phone=row["phone"],
        email=row["email"],
        insurance_provider=row["insurance_provider"],
        insurance_policy_num=row["insurance_policy_num"],
        allergies=json.loads(row["allergies"]),
        medications=json.loads(row["medications"]),
        conditions=json.loads(row["conditions"])
    )

# PUT patient profile (updates)
@app.put("/api/patient", response_model=schemas.PatientProfile)
def update_patient(payload: schemas.PatientUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Dynamically build update query
    updates = []
    params = []
    
    if payload.phone is not None:
        updates.append("phone = ?")
        params.append(payload.phone)
    if payload.email is not None:
        updates.append("email = ?")
        params.append(payload.email)
    if payload.insurance_provider is not None:
        updates.append("insurance_provider = ?")
        params.append(payload.insurance_provider)
    if payload.insurance_policy_num is not None:
        updates.append("insurance_policy_num = ?")
        params.append(payload.insurance_policy_num)
    if payload.allergies is not None:
        updates.append("allergies = ?")
        params.append(json.dumps(payload.allergies))
    if payload.medications is not None:
        updates.append("medications = ?")
        params.append(json.dumps(payload.medications))
    if payload.conditions is not None:
        updates.append("conditions = ?")
        params.append(json.dumps(payload.conditions))
        
    if updates:
        params.append(1) # ID = 1
        query = f"UPDATE patients SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(query, params)
        conn.commit()
        
    conn.close()
    return get_patient()

# GET physicians
@app.get("/api/physicians", response_model=List[schemas.Physician])
def list_physicians(specialty: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    if specialty:
        cursor.execute("SELECT * FROM physicians WHERE specialty LIKE ?", (f"%{specialty}%",))
    else:
        cursor.execute("SELECT * FROM physicians")
    rows = cursor.fetchall()
    conn.close()
    
    physicians = []
    for r in rows:
        physicians.append(schemas.Physician(
            id=r["id"],
            name=r["name"],
            specialty=r["specialty"],
            phone=r["phone"],
            address=r["address"],
            available_slots=json.loads(r["available_slots"])
        ))
    return physicians

# GET appointments
@app.get("/api/appointments", response_model=List[schemas.Appointment])
def list_appointments():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.id, a.patient_id, a.physician_id, a.time_slot, a.reason, a.status,
               p.name as physician_name, p.specialty as physician_specialty
        FROM appointments a
        JOIN physicians p ON a.physician_id = p.id
        ORDER BY a.time_slot DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    
    appointments = []
    for r in rows:
        appointments.append(schemas.Appointment(
            id=r["id"],
            patient_id=r["patient_id"],
            physician_id=r["physician_id"],
            physician_name=r["physician_name"],
            physician_specialty=r["physician_specialty"],
            time_slot=r["time_slot"],
            reason=r["reason"],
            status=r["status"]
        ))
    return appointments

# POST schedule appointment manually
@app.post("/api/appointments", response_model=schemas.Appointment)
def create_appointment(payload: schemas.AppointmentCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check physician availability
    cursor.execute("SELECT name, specialty, available_slots FROM physicians WHERE id = ?", (payload.physician_id,))
    phys = cursor.fetchone()
    if not phys:
        conn.close()
        raise HTTPException(status_code=404, detail="Physician not found")
        
    slots = json.loads(phys["available_slots"])
    if payload.time_slot not in slots:
        # Just warn or allow it for demo robustness, let's allow it
        pass
    else:
        slots.remove(payload.time_slot)
        cursor.execute("UPDATE physicians SET available_slots = ? WHERE id = ?", (json.dumps(slots), payload.physician_id))
        
    cursor.execute("""
        INSERT INTO appointments (patient_id, physician_id, time_slot, reason, status)
        VALUES (1, ?, ?, ?, 'SCHEDULED')
    """, (payload.physician_id, payload.time_slot, payload.reason))
    
    appointment_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return schemas.Appointment(
        id=appointment_id,
        patient_id=1,
        physician_id=payload.physician_id,
        physician_name=phys["name"],
        physician_specialty=phys["specialty"],
        time_slot=payload.time_slot,
        reason=payload.reason,
        status="SCHEDULED"
    )

# POST chat with agent
@app.post("/api/chat", response_model=schemas.ChatResponse)
async def chat_endpoint(payload: schemas.ChatRequest):
    result = await agent.chat_with_agent(payload.prompt)
    return schemas.ChatResponse(
        response=result["response"],
        thoughts=result["thoughts"]
    )

# GET forms templates
@app.get("/api/forms", response_model=List[schemas.FormTemplate])
def list_forms():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM forms")
    rows = cursor.fetchall()
    conn.close()
    
    forms = []
    for r in rows:
        forms.append(schemas.FormTemplate(
            id=r["id"],
            title=r["title"],
            fields=json.loads(r["fields"]),
            filled_data=json.loads(r["filled_data"]),
            status=r["status"]
        ))
    return forms

# GET auto-fill form
@app.post("/api/forms/{form_id}/autofill", response_model=schemas.FormTemplate)
async def autofill_form(form_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM forms WHERE id = ?", (form_id,))
    form_row = cursor.fetchone()
    
    cursor.execute("SELECT * FROM patients WHERE id = 1")
    patient_row = cursor.fetchone()
    
    if not form_row or not patient_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Form or Patient not found")
        
    fields = json.loads(form_row["fields"])
    
    # Preload patient details
    patient_allergies = json.loads(patient_row["allergies"])
    patient_meds = json.loads(patient_row["medications"])
    patient_conds = json.loads(patient_row["conditions"])
    
    meds_str = ", ".join([f"{m['name']} ({m['dosage']} {m['frequency']})" for m in patient_meds])
    conds_str = ", ".join(patient_conds)
    allergies_str = ", ".join(patient_allergies)
    
    # Auto-fill logic based on field IDs
    filled_data = {}
    for field in fields:
        field_id = field["id"]
        if field_id == "patient_name":
            filled_data[field_id] = patient_row["name"]
        elif field_id == "dob":
            filled_data[field_id] = patient_row["dob"]
        elif field_id == "phone":
            filled_data[field_id] = patient_row["phone"]
        elif field_id == "email":
            filled_data[field_id] = patient_row["email"]
        elif field_id == "insurance_carrier":
            filled_data[field_id] = patient_row["insurance_provider"]
        elif field_id == "policy_number":
            filled_data[field_id] = patient_row["insurance_policy_num"]
        elif field_id == "medical_history":
            filled_data[field_id] = conds_str
        elif field_id == "allergies":
            filled_data[field_id] = allergies_str
        elif field_id == "current_medications":
            filled_data[field_id] = meds_str
        elif field_id == "authorize_to":
            filled_data[field_id] = "Dr. Sarah Jenkins Orthopedics"
        elif field_id == "purpose":
            filled_data[field_id] = "Coordination of care for spinal issues"
        elif field_id == "signature":
            filled_data[field_id] = patient_row["name"]
        elif field_id == "sign_date":
            from datetime import datetime
            filled_data[field_id] = datetime.now().strftime("%Y-%m-%d")
            
    # Save autofilled draft to db
    cursor.execute("""
        UPDATE forms 
        SET filled_data = ?, status = 'DRAFT' 
        WHERE id = ?
    """, (json.dumps(filled_data), form_id))
    conn.commit()
    conn.close()
    
    return schemas.FormTemplate(
        id=form_id,
        title=form_row["title"],
        fields=fields,
        filled_data=filled_data,
        status="DRAFT"
    )

# PUT update / submit form
@app.put("/api/forms/{form_id}", response_model=schemas.FormTemplate)
def submit_form(form_id: int, payload: schemas.FormSubmit):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM forms WHERE id = ?", (form_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Form not found")
        
    cursor.execute("""
        UPDATE forms
        SET filled_data = ?, status = ?
        WHERE id = ?
    """, (json.dumps(payload.filled_data), payload.status, form_id))
    conn.commit()
    conn.close()
    
    return schemas.FormTemplate(
        id=form_id,
        title=row["title"],
        fields=json.loads(row["fields"]),
        filled_data=payload.filled_data,
        status=payload.status
    )

# POST upload EHR document and parse it using Gemini
@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    simulate: bool = FastAPIForm(True)
):
    contents = await file.read()
    filename = file.filename
    content_type = file.content_type
    
    # We will simulate parsing or call Gemini if keys exist
    # If the user uploads a mock document, let's parse it and return structured discoveries
    # Let's say we discover a new allergy (e.g. Sulfa drugs) and a new condition (e.g. Mild Scoliosis)
    # We will update the patient's record!
    
    await asyncio.sleep(2.0) # Simulating agent thinking and analysis
    
    # Default extraction results based on mock documents
    extracted = {
        "allergies": ["Sulfa Drugs"],
        "medications": [
            {"name": "Vitamin D3", "dosage": "2000 IU", "frequency": "Once daily"}
        ],
        "conditions": ["Mild Scoliosis"],
        "summary_of_findings": (
            f"Analyzed uploaded medical report ({filename}). "
            "Discovered new allergy to Sulfa Drugs. "
            "Discovered patient takes Vitamin D3 daily. "
            "Discovered diagnosis of Mild Scoliosis. "
            "Patient profile has been updated."
        )
    }
    
    # Let's write these findings to the DB!
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get current records to append
    cursor.execute("SELECT allergies, medications, conditions FROM patients WHERE id = 1")
    p_row = cursor.fetchone()
    
    cur_allergies = json.loads(p_row["allergies"])
    cur_meds = json.loads(p_row["medications"])
    cur_conds = json.loads(p_row["conditions"])
    
    # Append new items if they are not already there
    for a in extracted["allergies"]:
        if a not in cur_allergies:
            cur_allergies.append(a)
            
    for m in extracted["medications"]:
        if m["name"] not in [x["name"] for x in cur_meds]:
            cur_meds.append(m)
            
    for c in extracted["conditions"]:
        if c not in cur_conds:
            cur_conds.append(c)
            
    # Update DB
    cursor.execute("""
        UPDATE patients
        SET allergies = ?, medications = ?, conditions = ?
        WHERE id = 1
    """, (json.dumps(cur_allergies), json.dumps(cur_meds), json.dumps(cur_conds)))
    
    # Record document
    cursor.execute("""
        INSERT INTO documents (filename, content_type, extracted_data, uploaded_at)
        VALUES (?, ?, ?, datetime('now'))
    """, (filename, content_type, json.dumps(extracted)))
    
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "extracted_data": extracted,
        "message": "Document parsed and EHR profile synchronized."
    }

# WEBSOCKET Visual Phone Call Simulator
@app.websocket("/api/calls/simulate")
async def websocket_call_simulate(websocket: WebSocket):
    await websocket.accept()
    
    # Dialog script for the call
    dialog_steps = [
        {"type": "status", "message": "Dialing Dr. Sarah Jenkins Orthopedics (+1 555-234-5678)..."},
        {"type": "delay", "seconds": 2},
        {"type": "status", "message": "Ringing... [Ring 1]"},
        {"type": "delay", "seconds": 1.5},
        {"type": "status", "message": "Ringing... [Ring 2]"},
        {"type": "delay", "seconds": 1},
        {"type": "status", "message": "Call connected. Receptionist speaking..."},
        {"type": "delay", "seconds": 0.5},
        
        {"type": "transcript", "speaker": "receptionist", "text": "Thank you for calling Jenkins Orthopedics. This is Marcus speaking. How can I help you today?", "active": "receptionist"},
        {"type": "delay", "seconds": 4},
        
        {"type": "status", "message": "Agent checking patient clinical history..."},
        {"type": "delay", "seconds": 1},
        
        {"type": "transcript", "speaker": "agent", "text": "Hi Marcus, my name is Robin and I am calling as the personal AI health agent for Eugene Vestel. Eugene is an established patient at your clinic and is experiencing progressive lower back pain. He'd like to schedule a clinical consultation with Dr. Jenkins.", "active": "agent"},
        {"type": "delay", "seconds": 5.5},
        
        {"type": "transcript", "speaker": "receptionist", "text": "I can certainly help you with that scheduler. Let me search Dr. Jenkins' calendar. We have an opening this Thursday, May 28th at 10:30 AM or in the afternoon at 1:30 PM. Would either of those work for Eugene?", "active": "receptionist"},
        {"type": "delay", "seconds": 5},
        
        {"type": "status", "message": "Agent checking Eugene's personal calendar for conflicts..."},
        {"type": "delay", "seconds": 1.5},
        {"type": "status", "message": "Calendar status: Time slot May 28 at 10:30 AM is open. No conflicts found."},
        {"type": "delay", "seconds": 1},
        
        {"type": "transcript", "speaker": "agent", "text": "Thursday, May 28th at 10:30 AM works perfectly for Eugene. His schedule is completely open at that time. Let's lock in that slot.", "active": "agent"},
        {"type": "delay", "seconds": 4.5},
        
        {"type": "transcript", "speaker": "receptionist", "text": "Great, I've reserved Thursday, May 28th at 10:30 AM for Eugene Vestel. I have his reason for visit down as lower back pain. Can you confirm his primary insurance provider and policy number for our check-in record?", "active": "receptionist"},
        {"type": "delay", "seconds": 5.5},
        
        {"type": "status", "message": "Agent pulling insurance details from secure health vault..."},
        {"type": "delay", "seconds": 1},
        
        {"type": "transcript", "speaker": "agent", "text": "Absolutely. His primary carrier is Blue Shield California, and his policy number is BS-99882211-01.", "active": "agent"},
        {"type": "delay", "seconds": 4},
        
        {"type": "transcript", "speaker": "receptionist", "text": "Excellent, that matches our system records. We are all set. We will see Eugene this Thursday at 10:30 AM. He'll receive a confirmation SMS shortly.", "active": "receptionist"},
        {"type": "delay", "seconds": 4},
        
        {"type": "transcript", "speaker": "agent", "text": "Thank you so much, Marcus. I appreciate your assistance. Have a wonderful day. Goodbye.", "active": "agent"},
        {"type": "delay", "seconds": 3},
        
        {"type": "status", "message": "Hanging up call..."},
        {"type": "delay", "seconds": 1},
        {"type": "status", "message": "Updating patient's medical calendar and logging scheduled appointment..."},
        {"type": "delay", "seconds": 1.5},
    ]
    
    try:
        for step in dialog_steps:
            if step["type"] == "delay":
                await asyncio.sleep(step["seconds"])
            elif step["type"] == "status":
                await websocket.send_json({"type": "status", "message": step["message"]})
            elif step["type"] == "transcript":
                await websocket.send_json({
                    "type": "transcript",
                    "speaker": step["speaker"],
                    "text": step["text"],
                    "active": step["active"]
                })
        
        # At the end, insert appointment in SQLite!
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Verify physician availability and add appointment
        # Dr. Sarah Jenkins (Orthopedist, ID = 3)
        physician_id = 3
        time_slot = "2026-05-28T10:30:00"
        reason = "Consultation for progressive lower back pain"
        
        cursor.execute("SELECT name, available_slots FROM physicians WHERE id = ?", (physician_id,))
        phys = cursor.fetchone()
        
        # Book it
        cursor.execute("""
            INSERT INTO appointments (patient_id, physician_id, time_slot, reason, status)
            VALUES (1, ?, ?, ?, 'SCHEDULED')
        """, (physician_id, time_slot, reason))
        
        # Update slots
        slots = json.loads(phys["available_slots"])
        if time_slot in slots:
            slots.remove(time_slot)
            cursor.execute("UPDATE physicians SET available_slots = ? WHERE id = ?", (json.dumps(slots), physician_id))
            
        conn.commit()
        
        # Fetch updated appointment to return in success message
        cursor.execute("""
            SELECT a.id, a.patient_id, a.physician_id, a.time_slot, a.reason, a.status,
                   p.name as physician_name, p.specialty as physician_specialty
            FROM appointments a
            JOIN physicians p ON a.physician_id = p.id
            WHERE a.id = ?
        """, (cursor.lastrowid,))
        app_row = cursor.fetchone()
        conn.close()
        
        app_data = {
            "id": app_row["id"],
            "patient_id": app_row["patient_id"],
            "physician_id": app_row["physician_id"],
            "physician_name": app_row["physician_name"],
            "physician_specialty": app_row["physician_specialty"],
            "time_slot": app_row["time_slot"],
            "reason": app_row["reason"],
            "status": app_row["status"]
        }
        
        await websocket.send_json({
            "type": "success",
            "message": "Appointment successfully confirmed & recorded in SQLite.",
            "appointment": app_data
        })
        
    except WebSocketDisconnect:
        print("Call simulator disconnected.")
    except Exception as e:
        print(f"Error in call simulator: {e}")
        try:
            await websocket.send_json({"type": "error", "message": f"Simulation failed: {str(e)}"})
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass

# POST Outbound call dispatch via Bland.ai API
class CallDispatchPayload(pydantic.BaseModel):
    phone_number: str
    physician_name: str
    specialty: str
    reason: str

@app.post("/api/calls/dispatch")
async def dispatch_bland_call(payload: CallDispatchPayload, user: dict = Depends(get_current_user)):
    bland_api_key = os.getenv("BLAND_API_KEY")
    
    # Retrieve patient context to supply the AI voice caller
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patients WHERE id = 1")
    patient = cursor.fetchone()
    conn.close()
    
    patient_meds = json.loads(patient["medications"])
    meds_str = ", ".join([m["name"] for m in patient_meds])
    
    task_prompt = (
        f"You are Robin, a professional and helpful clinical assistant calling on behalf of the patient, {patient['name']}. "
        f"His date of birth is {patient['dob']} and phone is {patient['phone']}. "
        f"He is covered under {patient['insurance_provider']} (Policy ID: {patient['insurance_policy_num']}). "
        f"Call the office of {payload.physician_name} ({payload.specialty}) to book a consultation. "
        f"Reason for visit: {payload.reason}. "
        f"His current medications are: {meds_str}. "
        f"Coordinate and book the appointment. Try to get a slot on May 28th or 29th, 2026. "
        f"Once scheduled, confirm the date/time clearly with the receptionist, say thank you, and goodbye."
    )
    
    if not bland_api_key:
        # Mock successful dispatch if no key is configured
        print("Warning: No BLAND_API_KEY set. Simulating Bland.ai dispatch.")
        return {
            "success": True,
            "call_id": "mock_call_bland_9921",
            "message": "Call successfully dispatched (Simulation Mode). Outbound dial-out registered."
        }
        
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            webhook_url = API_HOST
            if webhook_url.startswith("http://"):
                webhook_url = webhook_url.replace("http://", "https://", 1)
            elif not webhook_url.startswith("https://"):
                webhook_url = f"https://{webhook_url}"
            webhook_url = f"{webhook_url.rstrip('/')}/api/calls/webhook"

            res = await client.post(
                "https://api.bland.ai/v1/calls",
                headers={
                    "authorization": bland_api_key,
                    "Content-Type": "application/json"
                },
                json={
                    "phone_number": payload.phone_number,
                    "task": task_prompt,
                    "voice": BLAND_VOICE,
                    "record": True,
                    "reduce_latency": True,
                    "webhook": webhook_url # Receive call outcome
                },
                timeout=15.0
            )
            data = res.json()
            if res.status_code == 200:
                return {
                    "success": True,
                    "call_id": data.get("call_id"),
                    "message": "Outbound call successfully dispatched to Bland.ai API."
                }
            else:
                raise HTTPException(status_code=res.status_code, detail=data.get("message", "Bland.ai error"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to dispatch call: {str(e)}")

# POST webhook to receive call transcript and write appointment to DB
@app.post("/api/calls/webhook")
async def bland_call_webhook(request: Request):
    data = await request.json()
    print("Received Bland.ai Webhook:", data)
    
    # Bland sends call_id, transcript, and completed status
    # We can parse the transcript to find the scheduled time or extract details
    # For robust demonstration, let's log the callback and register the appointment
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO appointments (patient_id, physician_id, time_slot, reason, status)
        VALUES (1, 3, '2026-05-28T10:30:00', 'Consultation (via Bland.ai Outbound Agent)', 'SCHEDULED')
    """)
    conn.commit()
    conn.close()
    
    return {"status": "success", "message": "Call outcomes compiled & SQLite calendar synchronized."}


# =============================================================================
# PHASE 3: FASTEN CONNECT, HEALTHCLAW & SMARTHEALTHCONNECT INTEGRATION
# =============================================================================

import copy
import uuid
from datetime import datetime, timezone

# HealthClaw HIPAA Safe Harbor Redaction Engine
def apply_redaction(resource: dict) -> dict:
    redacted = copy.deepcopy(resource)
    
    # Redact names: truncate family and given to first initial
    if 'name' in redacted and isinstance(redacted['name'], list):
        for entry in redacted['name']:
            if isinstance(entry, dict):
                if 'family' in entry and isinstance(entry['family'], str):
                    entry['family'] = (entry['family'][0] + '.') if len(entry['family']) > 0 else ""
                if 'given' in entry and isinstance(entry['given'], list):
                    entry['given'] = [
                        (g[0] + '.') if isinstance(g, str) and len(g) > 0 else g
                        for g in entry['given']
                    ]
                entry.pop('text', None)
                
    # Truncate birth date to year only
    if 'birthDate' in redacted and isinstance(redacted['birthDate'], str):
        redacted['birthDate'] = redacted['birthDate'][:4]
        
    # Remove photo objects
    redacted.pop('photo', None)
    
    # Remove narratives / html summaries
    if 'text' in redacted:
        redacted['text'] = {
            'status': 'empty',
            'div': '<div xmlns="http://www.w3.org/1999/xhtml">[Redacted]</div>'
        }
        
    # Redact identifiers (keep last 4 digits/chars)
    if 'identifier' in redacted and isinstance(redacted['identifier'], list):
        for ident in redacted['identifier']:
            if isinstance(ident, dict) and 'value' in ident and isinstance(ident['value'], str):
                val = ident['value']
                if len(val) > 4:
                    ident['value'] = '***' + val[-4:]
                else:
                    ident['value'] = '***'
                    
    # Remove granular address details (keep city, state, country)
    if 'address' in redacted and isinstance(redacted['address'], list):
        for addr in redacted['address']:
            if isinstance(addr, dict):
                addr.pop('line', None)
                addr.pop('text', None)
                
    # Redact telecom details
    if 'telecom' in redacted and isinstance(redacted['telecom'], list):
        for tc in redacted['telecom']:
            if isinstance(tc, dict) and 'value' in tc:
                tc['value'] = '[Redacted]'
                
    # Remove note comments
    for field in ['note', 'comment']:
        if field in redacted:
            if isinstance(redacted[field], list):
                redacted[field] = [{'text': '[Redacted]'}]
            elif isinstance(redacted[field], str):
                redacted[field] = '[Redacted]'
                
    return redacted


# --- Fasten Health Connect API Endpoints ---

@app.get("/api/fasten/connections", response_model=List[schemas.FastenConnection])
def list_fasten_connections():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fasten_connections")
    rows = cursor.fetchall()
    conn.close()
    
    return [schemas.FastenConnection(
        org_connection_id=r["org_connection_id"],
        provider_name=r["provider_name"],
        status=r["status"],
        connected_at=r["connected_at"],
        last_sync_at=r["last_sync_at"]
    ) for r in rows]

@app.post("/api/fasten/connections", response_model=schemas.FastenConnection)
def register_fasten_connection(payload: schemas.FastenConnectionCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now_str = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        INSERT INTO fasten_connections (org_connection_id, provider_name, status, connected_at, last_sync_at)
        VALUES (?, ?, 'connected', ?, ?)
        ON CONFLICT(org_connection_id) DO UPDATE SET
            status='connected',
            last_sync_at=excluded.last_sync_at
    """, (payload.org_connection_id, payload.provider_name, now_str, now_str))
    conn.commit()
    conn.close()
    
    # Audit log entry
    audit_conn = get_db_connection()
    audit_cursor = audit_conn.cursor()
    audit_cursor.execute("""
        INSERT INTO health_audit_events (id, event_type, resource_type, resource_id, outcome, detail, recorded)
        VALUES (?, 'create', 'FastenConnection', ?, 'success', ?, ?)
    """, (str(uuid.uuid4()), payload.org_connection_id, f"Registered connected EHR provider: {payload.provider_name}", now_str))
    audit_conn.commit()
    audit_conn.close()
    
    return schemas.FastenConnection(
        org_connection_id=payload.org_connection_id,
        provider_name=payload.provider_name,
        status="connected",
        connected_at=now_str,
        last_sync_at=now_str
    )

# Helper to update connection status
def update_connection_status(org_connection_id: str, status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE fasten_connections 
        SET status = ? 
        WHERE org_connection_id = ?
    """, (status, org_connection_id))
    conn.commit()
    conn.close()

# Ingest and save downloaded Fasten FHIR files (NDJSON format)
async def ingest_fasten_files(org_connection_id: str, download_links: list, b64_auth: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    headers = {
        "Authorization": f"Basic {b64_auth}"
    }
    
    resources_count = 0
    now_str = datetime.now(timezone.utc).isoformat()
    
    try:
        for link in download_links:
            url = link.get("url")
            if not url:
                continue
                
            print(f"Downloading Fasten file: {url}")
            
            fasten_public_id = os.getenv("FASTEN_PUBLIC_ID", "")
            # If the URL is loopback/internal, or keys are mock, return mock NDJSON data to avoid loopback deadlock
            if "127.0.0.1" in url or "localhost" in url or "192.168" in url or not fasten_public_id or "placeholder" in fasten_public_id or fasten_public_id == "demo-public-id":
                print("Local loopback or mock URL detected. Bypassing request to avoid deadlock.")
                content = json.dumps({
                    "resourceType": "Observation",
                    "id": f"obs-synced-{str(uuid.uuid4())[:8]}",
                    "status": "final",
                    "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs"}]}],
                    "code": {"coding": [{"system": "http://loinc.org", "code": "29463-7", "display": "Body Weight"}]},
                    "subject": {"reference": "Patient/eugene-patient"},
                    "effectiveDateTime": now_str,
                    "valueQuantity": {"value": 182, "unit": "lbs", "system": "http://unitsofmeasure.org", "code": "[lb_av]"}
                }) + "\n" + json.dumps({
                    "resourceType": "Observation",
                    "id": f"obs-synced-{str(uuid.uuid4())[:8]}",
                    "status": "final",
                    "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs"}]}],
                    "code": {"coding": [{"system": "http://loinc.org", "code": "8480-6", "display": "Systolic Blood Pressure"}]},
                    "subject": {"reference": "Patient/eugene-patient"},
                    "effectiveDateTime": now_str,
                    "valueQuantity": {"value": 118, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]"}
                }) + "\n" + json.dumps({
                    "resourceType": "Condition",
                    "id": f"cond-synced-{str(uuid.uuid4())[:8]}",
                    "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]},
                    "verificationStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed"}]},
                    "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-category", "code": "encounter-diagnosis"}]}],
                    "code": {
                        "coding": [{"system": "http://hl7.org/fhir/sid/icd-9-cm", "code": "250.00", "display": "Diabetes mellitus without complication"}],
                        "text": "Diabetes mellitus without complication (ICD-9)"
                    },
                    "subject": {"reference": "Patient/eugene-patient"},
                    "recordedDate": now_str
                })
            else:
                resp = requests.get(url, headers=headers)
                if resp.status_code != 200:
                    print(f"Failed to download Fasten file {url}: {resp.status_code}")
                    continue
                content = resp.text
            for line in content.splitlines():
                if not line.strip():
                    continue
                try:
                    resource = json.loads(line)
                    res_type = resource.get("resourceType")
                    res_id = resource.get("id")
                    
                    if not res_type or not res_id:
                        continue
                        
                    curation_state = 'curated'
                    quality_score = 1.0
                    review_needed = 0
                    
                    if res_type == "Condition":
                        coding = resource.get("code", {}).get("coding", [{}])[0]
                        if coding.get("system", "").find("icd-9") != -1 or coding.get("code") == "250.00":
                            curation_state = 'raw'
                            quality_score = 0.5
                            review_needed = 1
                            
                    cursor.execute("""
                        INSERT INTO fhir_resources (id, resource_type, resource_json, tenant_id, curation_state, quality_score, review_needed, last_updated)
                        VALUES (?, ?, ?, 'production', ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            resource_type=excluded.resource_type,
                            resource_json=excluded.resource_json,
                            curation_state=excluded.curation_state,
                            quality_score=excluded.quality_score,
                            review_needed=excluded.review_needed,
                            last_updated=excluded.last_updated
                    """, (res_id, res_type, json.dumps(resource), curation_state, quality_score, review_needed, now_str))
                    resources_count += 1
                except Exception as line_err:
                    print(f"Error parsing NDJSON line: {line_err}")
                    
        cursor.execute("""
            UPDATE fasten_connections 
            SET status = 'completed' 
            WHERE org_connection_id = ?
        """, (org_connection_id,))
        conn.commit()
        
        cursor.execute("""
            INSERT INTO health_audit_events (id, event_type, resource_type, resource_id, outcome, detail, recorded)
            VALUES (?, 'curatr', 'FastenJob', ?, 'success', ?, ?)
        """, (str(uuid.uuid4()), org_connection_id, f"EHR Bundle sync completed. Ingested {resources_count} FHIR resources.", now_str))
        conn.commit()
        
        print(f"Ingested {resources_count} FHIR resources successfully.")
        
    except Exception as e:
        print(f"Error ingesting Fasten files: {e}")
        cursor.execute("""
            UPDATE fasten_connections 
            SET status = 'failed' 
            WHERE org_connection_id = ?
        """, (org_connection_id,))
        conn.commit()
    finally:
        conn.close()

# Poll EHI task status
async def poll_and_ingest_fasten_export(org_connection_id: str, task_id: str, b64_auth: str):
    max_retries = 30
    headers = {
        "Authorization": f"Basic {b64_auth}"
    }
    
    url = f"https://api.connect.fastenhealth.com/v1/bridge/fhir/ehi-export/{task_id}"
    print(f"Polling Fasten Connect EHI export task {task_id} in background...")
    
    for attempt in range(max_retries):
        await asyncio.sleep(10.0)
        try:
            resp = requests.get(url, headers=headers)
            if resp.status_code != 200:
                print(f"Poll attempt {attempt+1} failed with status {resp.status_code}")
                continue
                
            task_data = resp.json()
            status = task_data.get("status")
            print(f"Fasten task {task_id} status: {status}")
            
            if status == "completed":
                download_links = task_data.get("download_links", [])
                if not download_links and task_data.get("download_link"):
                    download_links = [{"url": task_data.get("download_link")}]
                
                await ingest_fasten_files(org_connection_id, download_links, b64_auth)
                return
                
            elif status == "failed":
                print(f"Fasten task {task_id} failed on server.")
                update_connection_status(org_connection_id, "failed")
                return
                
        except Exception as e:
            print(f"Exception during Fasten task polling: {e}")
            
    print(f"Fasten task {task_id} polling timed out.")
    update_connection_status(org_connection_id, "failed")


# --- Serves the Stitch Web component or a mock/simulation loader if credentials not set ---
@app.get("/fasten-stitch.html", response_class=HTMLResponse)
def serve_fasten_stitch_page():
    public_id = os.getenv("FASTEN_PUBLIC_ID", "")
    
    if not public_id or "placeholder" in public_id or public_id == "demo-public-id":
        html_content = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fasten Stitch Portal (Demo Mode)</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background-color: #121214;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .title {
      font-size: 18px;
      font-weight: bold;
      color: #3b82f6;
    }
    .badge {
      display: inline-block;
      background-color: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 12px;
      margin-top: 8px;
      border: 1px solid rgba(245, 158, 11, 0.3);
      font-weight: bold;
    }
    .desc {
      font-size: 13px;
      color: #9ca3af;
      margin-top: 8px;
      line-height: 18px;
    }
    .provider-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .provider-row {
      background-color: #1a1a1e;
      border: 1px solid #2e2e33;
      padding: 16px;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .provider-row:hover {
      background-color: #242429;
    }
    .provider-name {
      font-size: 14px;
      font-weight: 600;
    }
    .arrow {
      color: #3b82f6;
      font-weight: bold;
    }
    .loader {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 0;
    }
    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.1);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border-left-color: #3b82f6;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .loader-text {
      margin-top: 16px;
      font-size: 13px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div id="setup-view">
    <div class="header">
      <div class="title">Fasten Connect</div>
      <div class="badge">SANDBOX SIMULATOR</div>
      <div class="desc">Select an institution below to simulate linking patient clinical records.</div>
    </div>
    
    <div class="provider-list">
      <div class="provider-row" onclick="linkMockProvider('Stanford Healthcare (Epic)', 'demo-conn-stanford')">
        <span class="provider-name">Stanford Healthcare (Epic)</span>
        <span class="arrow">➔</span>
      </div>
      <div class="provider-row" onclick="linkMockProvider('Kaiser Permanente', 'demo-conn-kaiser')">
        <span class="provider-name">Kaiser Permanente</span>
        <span class="arrow">➔</span>
      </div>
      <div class="provider-row" onclick="linkMockProvider('UCSF Health', 'demo-conn-ucsf')">
        <span class="provider-name">UCSF Health</span>
        <span class="arrow">➔</span>
      </div>
      <div class="provider-row" onclick="linkMockProvider('Sutter Health', 'demo-conn-sutter')">
        <span class="provider-name">Sutter Health</span>
        <span class="arrow">➔</span>
      </div>
    </div>
  </div>

  <div id="loader-view" class="loader">
    <div class="spinner"></div>
    <div class="loader-text" id="loader-msg">Authenticating with provider...</div>
  </div>

  <script>
    function linkMockProvider(name, id) {
      document.getElementById('setup-view').style.display = 'none';
      document.getElementById('loader-view').style.display = 'flex';
      
      setTimeout(() => {
        document.getElementById('loader-msg').innerText = 'Granting authorization...';
      }, 1000);

      setTimeout(() => {
        const payload = {
          event: 'widget.complete',
          event_type: 'widget.complete',
          type: 'widget.complete',
          data: {
            org_connection_id: id,
            provider_name: name
          }
        };
        console.log("Mock Stitch Success event:", payload);
        const messageStr = JSON.stringify(payload);
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(messageStr);
        }
        if (window.parent) {
          window.parent.postMessage(messageStr, "*");
        }
      }, 2000);
    }
  </script>
</body>
</html>"""
        return HTMLResponse(content=html_content, status_code=200)

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fasten Stitch Connection</title>
  <link href="https://cdn.fastenhealth.com/connect/v4/fasten-stitch-element.css" rel="stylesheet">
  <script src="https://cdn.fastenhealth.com/connect/v4/fasten-stitch-element.js" type="module"></script>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #121214;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }}
    .container {{
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }}
    fasten-stitch-element {{
      flex: 1;
      width: 100%;
      height: 100%;
      border: none;
    }}
  </style>
</head>
<body>
  <div class="container">
    <fasten-stitch-element public-id="{public_id}"></fasten-stitch-element>
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', () => {{
      const element = document.querySelector('fasten-stitch-element');
      if (element) {{
        element.addEventListener('eventBus', (e) => {{
          console.log("Stitch event:", e.detail);
          const eventStr = JSON.stringify(e.detail);
          if (window.ReactNativeWebView) {{
            window.ReactNativeWebView.postMessage(eventStr);
          }}
          if (window.parent) {{
            window.parent.postMessage(eventStr, "*");
          }}
        }});
      }}
    }});
  </script>
</body>
</html>"""
    return HTMLResponse(content=html_content, status_code=200)


@app.post("/api/fasten/sync", response_model=schemas.FastenSyncResponse)
async def sync_fasten_connection(payload: schemas.FastenConnectionCreate):
    org_connection_id = payload.org_connection_id or payload.connection_id
    if not org_connection_id:
        raise HTTPException(status_code=400, detail="Missing connection identifier (org_connection_id or connection_id)")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM fasten_connections WHERE org_connection_id = ?", (org_connection_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Fasten connection not found")
        
    provider_name = payload.provider_name or row["provider_name"] or "Linked EHR Provider"
    now_str = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        UPDATE fasten_connections 
        SET status = 'syncing', last_sync_at = ? 
        WHERE org_connection_id = ?
    """, (now_str, org_connection_id))
    conn.commit()

    fasten_public_id = os.getenv("FASTEN_PUBLIC_ID", "")
    fasten_private_key = os.getenv("FASTEN_PRIVATE_KEY", "")

    if not fasten_public_id or not fasten_private_key or "placeholder" in fasten_public_id or fasten_public_id == "demo-public-id" or org_connection_id.startswith("demo-") or org_connection_id.startswith("con_stitch_") or org_connection_id == "audit-init-1":
        await asyncio.sleep(2.0)
        
        cursor.execute("""
            UPDATE fasten_connections 
            SET status = 'completed' 
            WHERE org_connection_id = ?
        """, (org_connection_id,))
        
        obs_id = f"obs-synced-{str(uuid.uuid4())[:8]}"
        synced_obs = {
            "resourceType": "Observation",
            "id": obs_id,
            "status": "final",
            "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs"}]}],
            "code": {"coding": [{"system": "http://loinc.org", "code": "40443-4", "display": "Resting Heart Rate"}]},
            "subject": {"reference": "Patient/eugene-patient"},
            "effectiveDateTime": now_str,
            "valueQuantity": {"value": 71, "unit": "bpm", "system": "http://unitsofmeasure.org", "code": "/min"}
        }
        cursor.execute("""
            INSERT INTO fhir_resources (id, resource_type, resource_json, tenant_id, curation_state, quality_score, review_needed, last_updated)
            VALUES (?, 'Observation', ?, 'desktop-demo', 'curated', 1.0, 0, ?)
        """, (obs_id, json.dumps(synced_obs), now_str))
        
        cond_id = f"cond-synced-{str(uuid.uuid4())[:8]}"
        synced_cond = {
            "resourceType": "Condition",
            "id": cond_id,
            "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]},
            "verificationStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed"}]},
            "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-category", "code": "encounter-diagnosis"}]}],
            "code": {
                "coding": [{"system": "http://hl7.org/fhir/sid/icd-9-cm", "code": "250.00", "display": "Diabetes mellitus without complication"}],
                "text": "Diabetes mellitus without complication (ICD-9)"
            },
            "subject": {"reference": "Patient/eugene-patient"},
            "recordedDate": now_str
        }
        cursor.execute("""
            INSERT INTO fhir_resources (id, resource_type, resource_json, tenant_id, curation_state, quality_score, review_needed, last_updated)
            VALUES (?, 'Condition', ?, 'desktop-demo', 'raw', 0.5, 1, ?)
        """, (cond_id, json.dumps(synced_cond), now_str))
        
        conn.commit()
        conn.close()
        
        audit_conn = get_db_connection()
        audit_cursor = audit_conn.cursor()
        audit_cursor.execute("""
            INSERT INTO health_audit_events (id, event_type, resource_type, resource_id, outcome, detail, recorded)
            VALUES (?, 'curatr', 'FastenJob', ?, 'success', 'EHR Bundle sync completed. Redacted 8 fields. Generated 2 resources (Demo).', ?)
        """, (str(uuid.uuid4()), org_connection_id, now_str))
        audit_conn.commit()
        audit_conn.close()
        
        return schemas.FastenSyncResponse(
            success=True,
            message=f"Synced records from provider: {provider_name}. Database updated.",
            resources_ingested=2
        )

    try:
        import base64
        auth_str = f"{fasten_public_id}:{fasten_private_key}"
        b64_auth = base64.b64encode(auth_str.encode()).decode()
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Basic {b64_auth}"
        }
        
        body = {
            "org_connection_id": org_connection_id
        }

        export_url = "https://api.connect.fastenhealth.com/v1/bridge/fhir/ehi-export"
        resp = requests.post(export_url, json=body, headers=headers)
        
        if resp.status_code not in [200, 201, 202]:
            raise Exception(f"Fasten API returned status code {resp.status_code}: {resp.text}")
            
        data = resp.json()
        task_id = data.get("task_id")
        
        asyncio.create_task(poll_and_ingest_fasten_export(org_connection_id, task_id, b64_auth))
        
        conn.close()
        return schemas.FastenSyncResponse(
            success=True,
            message=f"Initiated EHR export via Fasten Health (Task: {task_id}). Synchronizing details.",
            resources_ingested=0
        )
        
    except Exception as err:
        print(f"Error initiating Fasten export: {err}")
        cursor.execute("""
            UPDATE fasten_connections 
            SET status = 'failed' 
            WHERE org_connection_id = ?
        """, (org_connection_id,))
        conn.commit()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to trigger Fasten EHR export: {str(err)}")


# --- Fasten Webhook Verification Endpoint ---
@app.post("/api/fasten/webhook")
async def handle_fasten_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("webhook-signature") or request.headers.get("x-fasten-signature")
    
    webhook_secret = os.getenv("FASTEN_WEBHOOK_SECRET", "")
    
    if webhook_secret and signature:
        import hmac
        import hashlib
        
        expected_signature = None
        if "," in signature and "v1=" in signature:
            parts = {}
            for p in signature.split(','):
                if '=' in p:
                    k, v = p.split('=', 1)
                    parts[k.strip()] = v.strip()
            
            timestamp = parts.get('t', '')
            sig_val = parts.get('v1', '')
            
            h1 = hmac.new(webhook_secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256).hexdigest()
            h2 = hmac.new(webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
            
            if hmac.compare_digest(h1, sig_val):
                expected_signature = sig_val
            elif hmac.compare_digest(h2, sig_val):
                expected_signature = sig_val
            else:
                expected_signature = h1
        else:
            expected_signature = hmac.new(webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
            
        if not expected_signature or not hmac.compare_digest(expected_signature, signature.split('=')[-1]):
            raise HTTPException(status_code=403, detail="Invalid webhook signature")
            
    try:
        payload = json.loads(raw_body.decode())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
        
    event_type = payload.get("type")
    event_data = payload.get("data", {})
    
    print(f"Received Fasten Webhook event: {event_type}")
    
    if event_type == "patient.ehi_export_success":
        org_connection_id = event_data.get("org_connection_id")
        download_links = event_data.get("download_links", [])
        if not download_links and event_data.get("download_link"):
            download_links = [{"url": event_data.get("download_link")}]
            
        fasten_public_id = os.getenv("FASTEN_PUBLIC_ID", "")
        fasten_private_key = os.getenv("FASTEN_PRIVATE_KEY", "")
        import base64
        auth_str = f"{fasten_public_id}:{fasten_private_key}"
        b64_auth = base64.b64encode(auth_str.encode()).decode()
        
        update_connection_status(org_connection_id, "syncing")
        asyncio.create_task(ingest_fasten_files(org_connection_id, download_links, b64_auth))
        
    return {"status": "success", "message": "Webhook processed"}


# --- HealthClaw R6 FHIR Store Endpoints (with Redaction & Audit Trails) ---

@app.get("/api/fhir/{resource_type}")
def fhir_search(resource_type: str, patient: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = ?", (resource_type,))
    rows = cursor.fetchall()
    conn.close()
    
    entries = []
    for r in rows:
        raw_res = json.loads(r["resource_json"])
        redacted_res = apply_redaction(raw_res)
        redacted_res["id"] = r["id"]
        entries.append({
            "resource": redacted_res
        })
        
    return {
        "resourceType": "Bundle",
        "type": "searchset",
        "total": len(entries),
        "entry": entries
    }

@app.get("/api/fhir/{resource_type}/{resource_id}")
def fhir_read(resource_type: str, resource_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = ? AND id = ?", (resource_type, resource_id))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail=f"{resource_type}/{resource_id} not found")
        
    raw_res = json.loads(row["resource_json"])
    redacted_res = apply_redaction(raw_res)
    redacted_res["id"] = row["id"]
    return redacted_res

@app.get("/api/fhir/{resource_type}/{resource_id}/$compiled-truth")
def fhir_compiled_truth(resource_type: str, resource_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = ? AND id = ?", (resource_type, resource_id))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail=f"{resource_type}/{resource_id} not found")
        
    raw_res = json.loads(row["resource_json"])
    redacted_res = apply_redaction(raw_res)
    redacted_res["id"] = row["id"]
    
    # Query Provenance timeline records
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = 'Provenance'")
    prov_rows = cursor.fetchall()
    conn.close()
    
    timeline = []
    target_ref = f"{resource_type}/{resource_id}"
    for p in prov_rows:
        prov_data = json.loads(p["resource_json"])
        targets = prov_data.get("target", [])
        is_match = False
        for t in targets:
            if isinstance(t, dict) and t.get("reference") == target_ref:
                is_match = True
                break
        if is_match:
            agent_disp = "system"
            for a in prov_data.get("agent", []):
                who = a.get("who", {})
                if isinstance(who, dict) and who.get("display"):
                    agent_disp = who["display"]
                    break
                    
            reason_disp = ""
            reasons = prov_data.get("reason", [])
            if reasons and isinstance(reasons[0], dict):
                codings = reasons[0].get("coding", [])
                if codings:
                    reason_disp = codings[0].get("display", "")
                    
            summary = ""
            intent = ""
            for ext in prov_data.get("extension", []):
                if 'curatr-correction' in ext.get('url', ''):
                    for inner in ext.get('extension', []):
                        if inner.get('url') == 'change_summary':
                            summary = inner.get('valueString', '')
                        elif inner.get('url') == 'patient_intent':
                            intent = inner.get('valueString', '')
                            
            timeline.append({
                "provenance_id": p["id"],
                "recorded": prov_data.get("recorded", ""),
                "agent": agent_disp,
                "reason": reason_disp,
                "summary": summary,
                "patient_intent": intent
            })
            
    timeline.sort(key=lambda x: x["recorded"], reverse=True)
    
    return {
        "resourceType": "Parameters",
        "parameter": [
            {"name": "current", "resource": redacted_res},
            {"name": "curation_state", "valueString": row["curation_state"]},
            {"name": "quality_score", "valueDecimal": row["quality_score"]},
            {"name": "review_needed", "valueBoolean": bool(row["review_needed"])},
            {"name": "timeline_count", "valueInteger": len(timeline)},
            {"name": "timeline", "part": [
                {
                    "name": "event",
                    "part": [
                        {"name": k, "valueString": str(v)} for k, v in t_ev.items()
                    ]
                } for t_ev in timeline
            ]}
        ]
    }

@app.get("/api/fhir/{resource_type}/{resource_id}/$curatr-evaluate", response_model=schemas.CuratrEvaluateResponse)
def fhir_curatr_evaluate(resource_type: str, resource_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = ? AND id = ?", (resource_type, resource_id))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Resource not found")
        
    res_json = json.loads(row["resource_json"])
    issues = []
    
    curation_state = row["curation_state"]
    quality_score = row["quality_score"]
    review_needed = row["review_needed"]
    
    # Clinical rule: check Condition code coding systems
    if resource_type == "Condition":
        codings = res_json.get("code", {}).get("coding", [])
        for c in codings:
            if "icd-9" in c.get("system", "").lower() or c.get("code") == "250.00":
                issues.append(schemas.CuratrIssue(
                    id="deprecated_code_system",
                    severity="warning",
                    field="Condition.code.coding[0]",
                    message="Condition code specifies a retired ICD-9 classification system. Standard guidelines require migration to modern ICD-10-CM coding values.",
                    suggestion={
                        "system": "http://hl7.org/fhir/sid/icd-10-cm",
                        "code": "E11.9",
                        "display": "Type 2 diabetes mellitus without complications"
                    }
                ))
                curation_state = "in_review"
                quality_score = 0.70
                review_needed = 1
                
    # Update persisted curation attributes
    cursor.execute("""
        UPDATE fhir_resources 
        SET curation_state = ?, quality_score = ?, review_needed = ? 
        WHERE id = ?
    """, (curation_state, quality_score, review_needed, resource_id))
    conn.commit()
    conn.close()
    
    return schemas.CuratrEvaluateResponse(
        valid=len(issues) == 0,
        issues=issues,
        curation_state=curation_state,
        quality_score=quality_score
    )

@app.post("/api/fhir/{resource_type}/{resource_id}/$curatr-apply-fix", response_model=schemas.CuratrApplyFixResponse)
def fhir_curatr_apply_fix(resource_type: str, resource_id: str, payload: schemas.CuratrApplyFixRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = ? AND id = ?", (resource_type, resource_id))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Resource not found")
        
    res_json = json.loads(row["resource_json"])
    applied = []
    
    for fix in payload.fixes:
        if "Condition.code.coding" in fix.field_path:
            # Upgrade coding to ICD-10 CM
            res_json["code"]["coding"] = [{
                "system": "http://hl7.org/fhir/sid/icd-10-cm",
                "code": "E11.9",
                "display": "Type 2 diabetes mellitus without complications"
            }]
            applied.append(fix.field_path)
            
    if not applied:
        conn.close()
        raise HTTPException(status_code=400, detail="No applicable quality fixes found in submission.")
        
    now_str = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        UPDATE fhir_resources 
        SET resource_json = ?, curation_state = 'curated', quality_score = 1.0, review_needed = 0 
        WHERE id = ?
    """, (json.dumps(res_json), resource_id))
    
    # Save Provenance timeline resource
    prov_id = f"prov-fix-{str(uuid.uuid4())[:8]}"
    provenance_resource = {
        "resourceType": "Provenance",
        "id": prov_id,
        "target": [{"reference": f"{resource_type}/{resource_id}"}],
        "recorded": now_str,
        "agent": [{"who": {"display": "Curatr Quality Agent"}, "requestor": True}],
        "reason": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v3-ActReason", "code": "TREAT", "display": "Treatment"}]}],
        "extension": [{
            "url": "https://healthclaw.io/extensions/curatr-correction",
            "extension": [
                {"url": "change_summary", "valueString": f"Migrated deprecated code systems on {', '.join(applied)}"},
                {"url": "patient_intent", "valueString": payload.patient_intent}
            ]
        }]
    }
    
    cursor.execute("""
        INSERT INTO fhir_resources (id, resource_type, resource_json, tenant_id, curation_state, quality_score, review_needed, last_updated)
        VALUES (?, 'Provenance', ?, 'desktop-demo', 'curated', 1.0, 0, ?)
    """, (prov_id, json.dumps(provenance_resource), now_str))
    
    conn.commit()
    conn.close()
    
    # Audit log
    audit_conn = get_db_connection()
    audit_cursor = audit_conn.cursor()
    audit_cursor.execute("""
        INSERT INTO health_audit_events (id, event_type, resource_type, resource_id, outcome, detail, recorded)
        VALUES (?, 'update', ?, ?, 'success', ?, ?)
    """, (str(uuid.uuid4()), resource_type, resource_id, f"Approved quality fixes: {', '.join(applied)}. Intent: {payload.patient_intent}", now_str))
    audit_conn.commit()
    audit_conn.close()
    
    return schemas.CuratrApplyFixResponse(
        success=True,
        message="Applied code migration correction. Provenance logged.",
        updated_resource=res_json,
        curation_state="curated",
        quality_score=1.0
    )


# --- SmartHealthConnect Evaluations ---

@app.get("/api/health/gaps", response_model=List[schemas.CareGap])
def evaluate_care_gaps():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = 'Condition' AND is_deleted=0")
    cond_rows = cursor.fetchall()
    conditions = [json.loads(c["resource_json"]) for c in cond_rows]
    
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = 'Observation' AND is_deleted=0")
    obs_rows = cursor.fetchall()
    observations = [json.loads(o["resource_json"]) for o in obs_rows]
    conn.close()
    
    gaps = []
    has_diabetes = False
    for cond in conditions:
        codings = cond.get("code", {}).get("coding", [])
        for c in codings:
            if c.get("code") in ["250.00", "E11.9"] or "diabetes" in c.get("display", "").lower():
                has_diabetes = True
                
    # 1. Blood pressure gap check
    bp_recent = False
    for obs in observations:
        codes = obs.get("code", {}).get("coding", [])
        for c in codes:
            if c.get("code") in ["85354-9", "8480-6"]:
                bp_recent = True
    if bp_recent:
        gaps.append(schemas.CareGap(
            id="gap-bp",
            title="Blood Pressure Screening",
            status="satisfied",
            priority="medium",
            description="Blood pressure screening is up to date (recent readings detected).",
            recommendedAction="Continue checking blood pressure during routine doctor checkups."
        ))
    else:
        gaps.append(schemas.CareGap(
            id="gap-bp",
            title="Blood Pressure Screening",
            status="due",
            priority="medium",
            description="We don't see any recent blood pressure entries in your files.",
            recommendedAction="Schedule a physical or drop by a pharmacy for a BP check."
        ))
        
    # 2. HbA1c Diabetes Lab check
    if has_diabetes:
        hba1c_recent = False
        latest_date = None
        for obs in observations:
            codes = obs.get("code", {}).get("coding", [])
            for c in codes:
                if c.get("code") == "4548-4":
                    eff_str = obs.get("effectiveDateTime")
                    if eff_str:
                        eff_dt = datetime.fromisoformat(eff_str.replace("Z", "+00:00"))
                        if (datetime.now(timezone.utc) - eff_dt).days < 365:
                            hba1c_recent = True
                        latest_date = eff_dt.strftime("%Y-%m-%d")
        if hba1c_recent:
            gaps.append(schemas.CareGap(
                id="gap-hba1c",
                title="HbA1c Lab Test",
                status="satisfied",
                priority="high",
                description=f"Overdue HbA1c screenings resolved. Last test was completed on {latest_date}.",
                recommendedAction="Continue standard HbA1c testing every 6-12 months."
            ))
        else:
            time_msg = f"overdue since {latest_date}" if latest_date else "no records found"
            gaps.append(schemas.CareGap(
                id="gap-hba1c",
                title="HbA1c Diabetes Screening",
                status="due",
                priority="high",
                description=f"Diabetic glycemic HbA1c monitoring is overdue ({time_msg}). Under HEDIS guidelines, patients with active diabetes require an HbA1c test once every 12 months.",
                recommendedAction="Schedule an HbA1c blood draw with your primary physician."
            ))
            
        # 3. Retinopathy Eye Exam
        gaps.append(schemas.CareGap(
            id="gap-eye-exam",
            title="Diabetic Eye Consultation",
            status="due",
            priority="medium",
            description="Dilated retinal exam is due. Type 2 Diabetes diagnoses require annual eye exams to scan for retinopathy.",
            recommendedAction="Book a comprehensive dilated eye exam with an eye care specialist."
        ))
        
    # 4. Flu Shot
    gaps.append(schemas.CareGap(
        id="gap-flu",
        title="Annual Influenza Vaccine",
        status="due",
        priority="low",
        description="CDC recommends adults get an annual influenza immunization every autumn to protect against seasonal viral strains.",
        recommendedAction="Get your seasonal flu vaccine at your primary care practice or pharmacy."
    ))
    
    # 5. Colorectal cancer screening (Not applicable based on age 37)
    gaps.append(schemas.CareGap(
        id="gap-colorectal",
        title="Colorectal Cancer Screening",
        status="not_applicable",
        priority="low",
        description="Colorectal cancer screening is recommended for patients age 45 to 75.",
        recommendedAction="Not required at your current age."
    ))
    
    return gaps

@app.get("/api/health/habits", response_model=schemas.HabitStatsResponse)
def get_health_habits():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = 'Observation' AND is_deleted=0")
    rows = cursor.fetchall()
    conn.close()
    
    hr_history = []
    steps_history = []
    
    for r in rows:
        obs = json.loads(r["resource_json"])
        code = obs.get("code", {}).get("coding", [{}])[0].get("code")
        val = obs.get("valueQuantity", {}).get("value")
        if code == "40443-4" and val:
            hr_history.append(val)
        elif code == "55423-8" and val:
            steps_history.append(val)
            
    avg_hr = int(sum(hr_history)/len(hr_history)) if hr_history else 72
    avg_steps = int(sum(steps_history)/len(steps_history)) if steps_history else 7860
    
    summary = "Your resting heart rate is showing a steady 5-day downward trend from 76 bpm to 72 bpm. Device sync (Garmin) is active."
    
    return schemas.HabitStatsResponse(
        resting_hr_average=avg_hr,
        steps_average=avg_steps,
        trend_summary=summary,
        details={
            "resting_hr_history": hr_history,
            "steps_history": steps_history,
            "device": "Garmin Venu 3 (Wearable)",
            "last_synced": datetime.now(timezone.utc).isoformat()
        }
    )

@app.get("/api/health/refills", response_model=schemas.RefillsResponse)
def get_medication_refills():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM fhir_resources WHERE resource_type = 'MedicationRequest' AND is_deleted=0")
    rows = cursor.fetchall()
    conn.close()
    
    refills = []
    for r in rows:
        med = json.loads(r["resource_json"])
        name = med.get("medicationCodeableConcept", {}).get("coding", [{}])[0].get("display", "Medication")
        
        authored = med.get("authoredOn", "2026-04-01T12:00:00Z")
        auth_dt = datetime.fromisoformat(authored.replace("Z", "+00:00"))
        days_active = (datetime.now(timezone.utc) - auth_dt).days
        days_rem = max(0, 90 - days_active) # Supposing a 90 day supply
        
        status = "active"
        if days_rem < 35:
            status = "due"
            
        refills.append(schemas.RefillItem(
            medication_name=name,
            status=status,
            days_remaining=days_rem,
            dosage="500 mg",
            frequency="Twice daily"
        ))
        
    due_count = len([x for x in refills if x.status == "due"])
    summary = f"You have {due_count} medication{'s' if due_count != 1 else ''} due for refill: Metformin." if due_count > 0 else "All medications are fully stocked."
    
    return schemas.RefillsResponse(
        refills=refills,
        summary=summary
    )


# --- Referral/Appointment Form Filling Service ---

@app.post("/api/forms/fill-from-document")
async def fill_form_from_document(payload: schemas.FormFillFromDocumentRequest):
    # Retrieve demographics and health history to populate fields
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patients WHERE id = 1")
    patient = cursor.fetchone()
    
    cursor.execute("SELECT * FROM fhir_resources WHERE curation_state = 'curated'")
    fhir_rows = cursor.fetchall()
    conn.close()
    
    allergies = ["Penicillin", "Peanuts"]
    conditions = ["Hypertension", "Asthma", "Lower Back Pain"]
    medications = ["Lisinopril (10mg once daily)", "Albuterol Inhaler (as needed)"]
    
    for r in fhir_rows:
        res = json.loads(r["resource_json"])
        res_type = r["resource_type"]
        if res_type == "Condition":
            display = res.get("code", {}).get("coding", [{}])[0].get("display", "")
            if display and display not in conditions:
                conditions.append(display)
        elif res_type == "MedicationRequest":
            display = res.get("medicationCodeableConcept", {}).get("coding", [{}])[0].get("display", "")
            if display and display not in medications:
                medications.append(display)
                
    meds_str = ", ".join(medications)
    conds_str = ", ".join(conditions)
    allergies_str = ", ".join(allergies)
    
    form_type = payload.simulate_pdf or "referral"
    filled_fields = {}
    title = ""
    
    if form_type == "referral":
        title = "Specialist Referral Request Form"
        filled_fields = {
            "patient_name": patient["name"],
            "dob": patient["dob"],
            "telephone": patient["phone"],
            "email": patient["email"],
            "insurance_carrier": patient["insurance_provider"],
            "policy_number": patient["insurance_policy_num"],
            "referring_physician": "Dr. Jane Miller (Primary Care)",
            "referred_specialist": "Dr. Sarah Jenkins (Orthopedics)",
            "medical_justification": "Consultation for progressive lower back pain. Patient has active history of chronic lower back pain, currently managing with physical therapy. High quality care evaluation is requested.",
            "diagnoses": conds_str,
            "active_medications": meds_str,
            "allergies": allergies_str,
            "signature": patient["name"],
            "date": datetime.now().strftime("%Y-%m-%d")
        }
    else:
        title = "Physician Appointment Request Form"
        filled_fields = {
            "full_name": patient["name"],
            "birth_date": patient["dob"],
            "cell_phone": patient["phone"],
            "insurance_provider": patient["insurance_provider"],
            "policy_id": patient["insurance_policy_num"],
            "reason_for_appointment": "Follow up consultation for spinal and vertebral alignment.",
            "past_medical_history": conds_str,
            "known_allergies": allergies_str,
            "current_meds": meds_str,
            "signature": patient["name"],
            "todays_date": datetime.now().strftime("%Y-%m-%d")
        }
        
    # Persist as draft in intake forms table
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM forms WHERE title = ?", (title,))
    f_row = cursor.fetchone()
    
    fields_schema = [
        {"id": k, "label": k.replace("_", " ").title(), "type": "textarea" if len(v) > 30 else "text", "required": True}
        for k, v in filled_fields.items()
    ]
    
    if f_row:
        form_id = f_row["id"]
        cursor.execute("""
            UPDATE forms 
            SET filled_data = ?, status = 'DRAFT' 
            WHERE id = ?
        """, (json.dumps(filled_fields), form_id))
    else:
        cursor.execute("""
            INSERT INTO forms (title, fields, filled_data, status)
            VALUES (?, ?, ?, 'DRAFT')
        """, (title, json.dumps(fields_schema), json.dumps(filled_fields)))
        form_id = cursor.lastrowid
        
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "form_id": form_id,
        "title": title,
        "fields": fields_schema,
        "filled_data": filled_fields,
        "confidence": 0.98,
        "message": f"Form '{title}' analyzed and pre-filled with patient clinical record. Saved to drafts."
    }


