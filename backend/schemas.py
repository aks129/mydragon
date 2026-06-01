from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class ChatRequest(BaseModel):
    prompt: str

class ChatResponse(BaseModel):
    response: str
    thoughts: str

class PatientUpdate(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_policy_num: Optional[str] = None
    allergies: Optional[List[str]] = None
    medications: Optional[List[Dict[str, str]]] = None
    conditions: Optional[List[str]] = None

class PatientProfile(BaseModel):
    id: int
    name: str
    dob: str
    phone: str
    email: str
    insurance_provider: str
    insurance_policy_num: str
    allergies: List[str]
    medications: List[Dict[str, str]]
    conditions: List[str]

class Physician(BaseModel):
    id: int
    name: str
    specialty: str
    phone: str
    address: str
    available_slots: List[str]

class AppointmentCreate(BaseModel):
    physician_id: int
    time_slot: str
    reason: str

class Appointment(BaseModel):
    id: int
    patient_id: int
    physician_id: int
    physician_name: str
    physician_specialty: str
    time_slot: str
    reason: str
    status: str

class FormTemplate(BaseModel):
    id: int
    title: str
    fields: List[Dict[str, Any]]
    filled_data: Dict[str, Any]
    status: str

class FormSubmit(BaseModel):
    filled_data: Dict[str, Any]
    status: str # DRAFT, VERIFIED, SUBMITTED

# --- Fasten Health Connect Schemas ---
class FastenConnectionCreate(BaseModel):
    org_connection_id: str
    provider_name: str

class FastenConnection(BaseModel):
    org_connection_id: str
    provider_name: str
    status: str
    connected_at: Optional[str] = None
    last_sync_at: Optional[str] = None

class FastenSyncResponse(BaseModel):
    success: bool
    message: str
    resources_ingested: int

# --- HealthClaw Curatr Schemas ---
class CuratrIssue(BaseModel):
    id: str
    severity: str
    field: str
    message: str
    suggestion: Optional[Dict[str, Any]] = None

class CuratrEvaluateResponse(BaseModel):
    valid: bool
    issues: List[CuratrIssue]
    curation_state: str
    quality_score: float

class CuratrFix(BaseModel):
    field_path: str
    new_value: Any

class CuratrApplyFixRequest(BaseModel):
    fixes: List[CuratrFix]
    patient_intent: str

class CuratrApplyFixResponse(BaseModel):
    success: bool
    message: str
    updated_resource: Dict[str, Any]
    curation_state: str
    quality_score: float

# --- SmartHealthConnect Care Gaps, Wearables, and Refills ---
class CareGap(BaseModel):
    id: str
    title: str
    status: str # due, satisfied, not_applicable
    priority: str # high, medium, low
    description: str
    recommendedAction: str
    dueDate: Optional[str] = None

class HabitStatsResponse(BaseModel):
    resting_hr_average: int
    steps_average: int
    trend_summary: str
    details: Dict[str, Any]

class RefillItem(BaseModel):
    medication_name: str
    status: str # due, active, completed
    days_remaining: int
    dosage: str
    frequency: str

class RefillsResponse(BaseModel):
    refills: List[RefillItem]
    summary: str

# --- Form Filler vision schemas ---
class FormFillFromDocumentRequest(BaseModel):
    document_url: Optional[str] = None
    simulate_pdf: Optional[str] = None # referral, appointment, or None
