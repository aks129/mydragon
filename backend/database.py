import sqlite3
import json
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "healthcare.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Patients Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        dob TEXT,
        phone TEXT,
        email TEXT,
        insurance_provider TEXT,
        insurance_policy_num TEXT,
        allergies TEXT, -- JSON array of strings
        medications TEXT, -- JSON array of objects
        conditions TEXT -- JSON array of strings
    )
    """)

    # Physicians Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS physicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        specialty TEXT,
        phone TEXT,
        address TEXT,
        available_slots TEXT -- JSON array of ISO timestamps
    )
    """)

    # Appointments Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER,
        physician_id INTEGER,
        time_slot TEXT NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'SCHEDULED',
        FOREIGN KEY(patient_id) REFERENCES patients(id),
        FOREIGN KEY(physician_id) REFERENCES physicians(id)
    )
    """)

    # Documents Table (EHR records parsed by agent)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        content_type TEXT,
        extracted_data TEXT, -- JSON of findings
        uploaded_at TEXT
    )
    """)

    # Forms Table (Clinical Intake Forms)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS forms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        fields TEXT, -- JSON representing fields template
        filled_data TEXT, -- JSON representing patient filled data
        status TEXT DEFAULT 'BLANK' -- BLANK, DRAFT, VERIFIED, SUBMITTED
    )
    """)

    # Agent Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS agent_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT,
        status TEXT,
        steps TEXT,
        created_at TEXT
    )
    """)
    # FHIR Resources Table (HealthClaw engine emulation)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS fhir_resources (
        id TEXT PRIMARY KEY,
        resource_type TEXT NOT NULL,
        resource_json TEXT NOT NULL,
        tenant_id TEXT,
        curation_state TEXT DEFAULT 'raw', -- raw, in_review, curated
        quality_score REAL DEFAULT 1.0,
        review_needed INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        last_updated TEXT
    )
    """)

    # Fasten Connections Table (Fasten Health Connect emulation)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS fasten_connections (
        org_connection_id TEXT PRIMARY KEY,
        provider_name TEXT NOT NULL,
        status TEXT NOT NULL, -- connected, syncing, completed, failed
        connected_at TEXT,
        last_sync_at TEXT
    )
    """)

    # Health Audit Events Table (HealthClaw Audit Trail)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS health_audit_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL, -- read, create, update, delete, validate, curatr
        resource_type TEXT,
        resource_id TEXT,
        outcome TEXT, -- success, failure
        detail TEXT,
        recorded TEXT
    )
    """)

    conn.commit()
    conn.close()

def seed_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Seed standard patient demographic profile
    cursor.execute("SELECT COUNT(*) FROM patients")
    if cursor.fetchone()[0] == 0:
        patient_data = (
            "Eugene Vestel",
            "1988-11-12",
            "+1 (555) 019-2834",
            "eugene.vestel@example.com",
            "Blue Shield California",
            "BS-99882211-01",
            json.dumps(["Penicillin", "Peanuts"]),
            json.dumps([
                {"name": "Lisinopril", "dosage": "10mg", "frequency": "Once daily"},
                {"name": "Albuterol Inhaler", "dosage": "90mcg", "frequency": "As needed for asthma"}
            ]),
            json.dumps(["Hypertension", "Asthma", "Lower Back Pain"])
        )
        cursor.execute("""
        INSERT INTO patients (name, dob, phone, email, insurance_provider, insurance_policy_num, allergies, medications, conditions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, patient_data)

    # 2. Seed Physicians
    cursor.execute("SELECT COUNT(*) FROM physicians")
    if cursor.fetchone()[0] == 0:
        physicians = [
            ("Dr. Jane Miller", "Primary Care Physician", "+1 (555) 321-4567", "100 Medical Center Way, Suite 400, San Francisco, CA", 
             json.dumps(["2026-05-27T09:00:00", "2026-05-27T11:30:00", "2026-05-28T14:00:00", "2026-05-28T16:30:00"])),
            ("Dr. Alan Smith", "Cardiologist", "+1 (555) 987-6543", "450 Sutter St, Suite 1200, San Francisco, CA", 
             json.dumps(["2026-05-27T10:00:00", "2026-05-27T15:00:00", "2026-05-29T11:00:00"])),
            ("Dr. Sarah Jenkins", "Orthopedic Surgeon", "+1 (555) 234-5678", "1200 Gough St, Suite A, San Francisco, CA", 
             json.dumps(["2026-05-28T10:30:00", "2026-05-28T13:30:00", "2026-05-30T09:00:00"]))
        ]
        cursor.executemany("""
        INSERT INTO physicians (name, specialty, phone, address, available_slots)
        VALUES (?, ?, ?, ?, ?)
        """, physicians)

    # 3. Seed Intake Form templates
    cursor.execute("SELECT COUNT(*) FROM forms")
    if cursor.fetchone()[0] == 0:
        forms = [
            ("Standard Patient Intake Form", json.dumps([
                {"id": "patient_name", "label": "Full Name", "type": "text", "required": True},
                {"id": "dob", "label": "Date of Birth", "type": "date", "required": True},
                {"id": "phone", "label": "Phone Number", "type": "text", "required": True},
                {"id": "email", "label": "Email Address", "type": "text", "required": True},
                {"id": "insurance_carrier", "label": "Insurance Provider", "type": "text", "required": False},
                {"id": "policy_number", "label": "Policy Number", "type": "text", "required": False},
                {"id": "medical_history", "label": "Known Medical Conditions", "type": "textarea", "required": False},
                {"id": "allergies", "label": "Allergies", "type": "textarea", "required": False},
                {"id": "current_medications", "label": "Current Medications", "type": "textarea", "required": False}
            ]), json.dumps({}), "BLANK"),
            ("HIPAA Authorization Form", json.dumps([
                {"id": "patient_name", "label": "Patient Full Name", "type": "text", "required": True},
                {"id": "dob", "label": "Date of Birth", "type": "date", "required": True},
                {"id": "authorize_to", "label": "Authorize Release To", "type": "text", "required": True},
                {"id": "purpose", "label": "Purpose of Release", "type": "text", "required": True},
                {"id": "signature", "label": "Patient Signature (Type Name)", "type": "text", "required": True},
                {"id": "sign_date", "label": "Date of Signature", "type": "date", "required": True}
            ]), json.dumps({}), "BLANK")
        ]
        cursor.executemany("""
        INSERT INTO forms (title, fields, filled_data, status)
        VALUES (?, ?, ?, ?)
        """, forms)

    # 4. Seed initial mock appointments
    cursor.execute("SELECT COUNT(*) FROM appointments")
    if cursor.fetchone()[0] == 0:
        appointments = [
            (1, 1, "2026-05-15T10:00:00", "Routine physical exam", "COMPLETED")
        ]
        cursor.executemany("""
        INSERT INTO appointments (patient_id, physician_id, time_slot, reason, status)
        VALUES (?, ?, ?, ?, ?)
        """, appointments)

    # 5. Seed initial FHIR Resources (Patient, Conditions, Observations, MedicationRequests)
    cursor.execute("SELECT COUNT(*) FROM fhir_resources")
    if cursor.fetchone()[0] == 0:
        now_str = datetime.now(timezone.utc).isoformat()
        
        # Seed FHIR Patient resource
        patient_fhir = {
            "resourceType": "Patient",
            "id": "eugene-patient",
            "active": True,
            "name": [{"use": "official", "family": "Vestel", "given": ["Eugene"]}],
            "gender": "male",
            "birthDate": "1988-11-12",
            "telecom": [
                {"system": "phone", "value": "+1 (555) 019-2834", "use": "mobile"},
                {"system": "email", "value": "eugene.vestel@example.com"}
            ],
            "address": [{"line": ["123 Main St"], "city": "San Francisco", "state": "CA", "postalCode": "94102"}]
        }
        
        # Seed FHIR Condition resource (Diabetes using deprecated ICD-9)
        diabetes_fhir = {
            "resourceType": "Condition",
            "id": "diabetes-cond",
            "clinicalStatus": {
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                    "code": "active"
                }]
            },
            "verificationStatus": {
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                    "code": "confirmed"
                }]
            },
            "code": {
                "coding": [{
                    "system": "http://hl7.org/fhir/sid/icd-9-cm",
                    "code": "250.00",
                    "display": "Diabetes mellitus without mention of complication, type II or unspecified type"
                }],
                "text": "Type 2 Diabetes"
            },
            "subject": {"reference": "Patient/eugene-patient"},
            "recordedDate": "2024-03-12"
        }

        # Seed Hypertension Condition
        hypertension_fhir = {
            "resourceType": "Condition",
            "id": "htn-cond",
            "clinicalStatus": {
                "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]
            },
            "code": {
                "coding": [{"system": "http://snomed.info/sct", "code": "38341003", "display": "Essential hypertension"}],
                "text": "Hypertension"
            },
            "subject": {"reference": "Patient/eugene-patient"}
        }

        # Seed Blood Pressure Observation (LOINC 85354-9)
        bp_fhir = {
            "resourceType": "Observation",
            "id": "bp-obs",
            "status": "final",
            "category": [{
                "coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs"}]
            }],
            "code": {
                "coding": [{"system": "http://loinc.org", "code": "85354-9", "display": "Blood pressure panel"}]
            },
            "subject": {"reference": "Patient/eugene-patient"},
            "effectiveDateTime": "2026-05-15T09:30:00Z",
            "component": [
                {
                    "code": {"coding": [{"system": "http://loinc.org", "code": "8480-6", "display": "Systolic blood pressure"}]},
                    "valueQuantity": {"value": 120, "unit": "mmHg"}
                },
                {
                    "code": {"coding": [{"system": "http://loinc.org", "code": "8462-4", "display": "Diastolic blood pressure"}]},
                    "valueQuantity": {"value": 78, "unit": "mmHg"}
                }
            ]
        }

        # Seed old HbA1c Observation (LOINC 4548-4, from >1 year ago)
        hba1c_fhir = {
            "resourceType": "Observation",
            "id": "hba1c-obs",
            "status": "final",
            "category": [{
                "coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "laboratory"}]
            }],
            "code": {
                "coding": [{"system": "http://loinc.org", "code": "4548-4", "display": "Hemoglobin A1c"}]
            },
            "subject": {"reference": "Patient/eugene-patient"},
            "effectiveDateTime": "2024-04-12T10:00:00Z",
            "valueQuantity": {"value": 8.2, "unit": "%", "system": "http://unitsofmeasure.org", "code": "%"}
        }

        # Seed MedicationRequest (Metformin)
        metformin_fhir = {
            "resourceType": "MedicationRequest",
            "id": "metformin-med",
            "status": "active",
            "intent": "order",
            "medicationCodeableConcept": {
                "coding": [{"system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "860975", "display": "Metformin 500 MG"}]
            },
            "subject": {"reference": "Patient/eugene-patient"},
            "authoredOn": "2026-04-01T12:00:00Z",
            "dispenseRequest": {
                "validityPeriod": {
                    "start": "2026-04-01T12:00:00Z",
                    "end": "2026-10-01T12:00:00Z"
                },
                "numberOfRepeatsAllowed": 3,
                "quantity": {"value": 90, "unit": "TAB"}
            }
        }

        # Seed Wearable Resting Heart Rate observations to show Garmin / Fitbit trend
        rhr_observations = []
        rhr_data = [
            ("rhr-obs-5", "2026-05-26T08:00:00Z", 76),
            ("rhr-obs-4", "2026-05-27T08:00:00Z", 74),
            ("rhr-obs-3", "2026-05-28T08:00:00Z", 75),
            ("rhr-obs-2", "2026-05-29T08:00:00Z", 73),
            ("rhr-obs-1", "2026-05-30T08:00:00Z", 72)
        ]
        for obs_id, time_iso, val in rhr_data:
            rhr_observations.append({
                "resourceType": "Observation",
                "id": obs_id,
                "status": "final",
                "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs"}]}],
                "code": {"coding": [{"system": "http://loinc.org", "code": "40443-4", "display": "Resting Heart Rate"}]},
                "subject": {"reference": "Patient/eugene-patient"},
                "effectiveDateTime": time_iso,
                "valueQuantity": {"value": val, "unit": "bpm", "system": "http://unitsofmeasure.org", "code": "/min"}
            })

        # Seed Wearable Step Count observations
        step_observations = []
        step_data = [
            ("steps-obs-5", "2026-05-26T21:00:00Z", 5200),
            ("steps-obs-4", "2026-05-27T21:00:00Z", 10400),
            ("steps-obs-3", "2026-05-28T21:00:00Z", 6100),
            ("steps-obs-2", "2026-05-29T21:00:00Z", 9200),
            ("steps-obs-1", "2026-05-30T21:00:00Z", 8400)
        ]
        for obs_id, time_iso, val in step_data:
            step_observations.append({
                "resourceType": "Observation",
                "id": obs_id,
                "status": "final",
                "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs"}]}],
                "code": {"coding": [{"system": "http://loinc.org", "code": "55423-8", "display": "Step count"}]},
                "subject": {"reference": "Patient/eugene-patient"},
                "effectiveDateTime": time_iso,
                "valueQuantity": {"value": val, "unit": "steps", "system": "http://unitsofmeasure.org", "code": "{steps}"}
            })

        # Insert seeded resources into SQLite table
        # For Condition 'diabetes-cond', set curation_state to 'raw' and quality_score to 0.70 to trigger review
        fhir_rows = [
            ("eugene-patient", "Patient", json.dumps(patient_fhir), "desktop-demo", "curated", 1.0, 0, now_str),
            ("diabetes-cond", "Condition", json.dumps(diabetes_fhir), "desktop-demo", "raw", 0.70, 1, now_str),
            ("htn-cond", "Condition", json.dumps(hypertension_fhir), "desktop-demo", "curated", 1.0, 0, now_str),
            ("bp-obs", "Observation", json.dumps(bp_fhir), "desktop-demo", "curated", 1.0, 0, now_str),
            ("hba1c-obs", "Observation", json.dumps(hba1c_fhir), "desktop-demo", "curated", 1.0, 0, now_str),
            ("metformin-med", "MedicationRequest", json.dumps(metformin_fhir), "desktop-demo", "curated", 1.0, 0, now_str),
        ]
        
        for rhr in rhr_observations:
            fhir_rows.append((rhr["id"], "Observation", json.dumps(rhr), "desktop-demo", "curated", 1.0, 0, now_str))
        for steps in step_observations:
            fhir_rows.append((steps["id"], "Observation", json.dumps(steps), "desktop-demo", "curated", 1.0, 0, now_str))

        cursor.executemany("""
        INSERT INTO fhir_resources (id, resource_type, resource_json, tenant_id, curation_state, quality_score, review_needed, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, fhir_rows)

        # Seed Fasten Connections
        cursor.execute("""
        INSERT INTO fasten_connections (org_connection_id, provider_name, status, connected_at, last_sync_at)
        VALUES ('demo-conn-stanford', 'Stanford Healthcare (Epic)', 'connected', ?, ?)
        """, (now_str, now_str))

        # Seed some audit events
        audit_records = [
            ("audit-init-1", "create", "Patient", "eugene-patient", "success", "Fasten Connect webhook imported patient bundle", now_str),
            ("audit-init-2", "curatr", "Condition", "diabetes-cond", "failure", "Curatr flagged issue: deprecated_code_system (ICD-9)", now_str),
        ]
        cursor.executemany("""
        INSERT INTO health_audit_events (id, event_type, resource_type, resource_id, outcome, detail, recorded)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, audit_records)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    seed_db()
    print("Database initialized and seeded successfully.")
