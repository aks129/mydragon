// API Client for the Healthcare Agent Application
import { Platform } from "react-native";

// In React Native:
// - iOS Simulator: localhost
// - Android Emulator: 10.0.2.2
const DEV_IP = "192.168.4.27";
const LOCALHOST = Platform.OS === "android" ? "10.0.2.2" : DEV_IP;

// Set to true to point frontend at the hosted Cloud Run server
export const USE_PRODUCTION = true;
export const PROD_URL = "https://healthcare-agent-backend-959144392292.us-central1.run.app";

export const API_HOST = USE_PRODUCTION ? PROD_URL.replace("https://", "") : `${LOCALHOST}:8000`;
export const BASE_URL = USE_PRODUCTION ? PROD_URL : `http://${API_HOST}`;
export const WS_URL = USE_PRODUCTION ? `wss://${API_HOST}` : `ws://${API_HOST}`;

export async function fetchPatientProfile() {
  const res = await fetch(`${BASE_URL}/api/patient`);
  if (!res.ok) throw new Error("Failed to fetch patient profile");
  return res.json();
}

export async function updatePatientProfile(data: any) {
  const res = await fetch(`${BASE_URL}/api/patient`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update patient profile");
  return res.json();
}

export async function fetchPhysicians(specialty?: string) {
  const url = specialty 
    ? `${BASE_URL}/api/physicians?specialty=${encodeURIComponent(specialty)}`
    : `${BASE_URL}/api/physicians`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch physicians");
  return res.json();
}

export async function fetchAppointments() {
  const res = await fetch(`${BASE_URL}/api/appointments`);
  if (!res.ok) throw new Error("Failed to fetch appointments");
  return res.json();
}

export async function scheduleAppointment(physicianId: number, timeSlot: string, reason: string) {
  const res = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ physician_id: physicianId, time_slot: timeSlot, reason }),
  });
  if (!res.ok) throw new Error("Failed to schedule appointment");
  return res.json();
}

export async function sendChatPrompt(prompt: string) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error("Failed to get response from agent");
  return res.json();
}

export async function fetchForms() {
  const res = await fetch(`${BASE_URL}/api/forms`);
  if (!res.ok) throw new Error("Failed to fetch forms");
  return res.json();
}

export async function autofillForm(formId: number) {
  const res = await fetch(`${BASE_URL}/api/forms/${formId}/autofill`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to autofill form");
  return res.json();
}

export async function submitForm(formId: number, filledData: any, status: string) {
  const res = await fetch(`${BASE_URL}/api/forms/${formId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filled_data: filledData, status }),
  });
  if (!res.ok) throw new Error("Failed to submit form");
  return res.json();
}

// Mock Upload implementation to work in both Simulator and real app without requiring file picker libraries
export async function uploadMockDocument(filename: string, fileType: string) {
  const formData = new FormData();
  // Construct a dummy file-like object
  formData.append("file", {
    uri: "file:///dummy.pdf",
    name: filename,
    type: fileType,
  } as any);
  formData.append("simulate", "true");

  const res = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: "POST",
    body: formData,
    headers: {
      "Accept": "application/json",
      "Content-Type": "multipart/form-data",
    },
  });
  if (!res.ok) throw new Error("Failed to upload document");
  return res.json();
}

export async function fetchFastenConnections() {
  const res = await fetch(`${BASE_URL}/api/fasten/connections`);
  if (!res.ok) throw new Error("Failed to fetch Fasten connections");
  return res.json();
}

export async function registerFastenConnection(orgConnectionId: string, providerName: string) {
  const res = await fetch(`${BASE_URL}/api/fasten/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_connection_id: orgConnectionId, provider_name: providerName }),
  });
  if (!res.ok) throw new Error("Failed to register Fasten connection");
  return res.json();
}

export async function syncFastenProvider(orgConnectionId: string, providerName: string) {
  const res = await fetch(`${BASE_URL}/api/fasten/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_connection_id: orgConnectionId, provider_name: providerName }),
  });
  if (!res.ok) throw new Error("Failed to sync Fasten provider");
  return res.json();
}

export async function fetchFhirResources(resourceType: string) {
  const res = await fetch(`${BASE_URL}/api/fhir/${resourceType}`);
  if (!res.ok) throw new Error(`Failed to fetch FHIR resources of type ${resourceType}`);
  return res.json();
}

export async function fetchCompiledTruth(resourceType: string, resourceId: string) {
  const res = await fetch(`${BASE_URL}/api/fhir/${resourceType}/${resourceId}/$compiled-truth`);
  if (!res.ok) throw new Error("Failed to fetch FHIR compiled truth");
  return res.json();
}

export async function evaluateCuratr(resourceType: string, resourceId: string) {
  const res = await fetch(`${BASE_URL}/api/fhir/${resourceType}/${resourceId}/$curatr-evaluate`);
  if (!res.ok) throw new Error("Failed to evaluate FHIR resource quality");
  return res.json();
}

export async function applyCuratrFix(resourceType: string, resourceId: string, fixes: any[], patientIntent: string) {
  const res = await fetch(`${BASE_URL}/api/fhir/${resourceType}/${resourceId}/$curatr-apply-fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixes, patient_intent: patientIntent }),
  });
  if (!res.ok) throw new Error("Failed to apply Curatr fixes");
  return res.json();
}

export async function fetchCareGaps() {
  const res = await fetch(`${BASE_URL}/api/health/gaps`);
  if (!res.ok) throw new Error("Failed to fetch care gaps");
  return res.json();
}

export async function fetchHealthHabits() {
  const res = await fetch(`${BASE_URL}/api/health/habits`);
  if (!res.ok) throw new Error("Failed to fetch health habits");
  return res.json();
}

export async function fetchMedicationRefills() {
  const res = await fetch(`${BASE_URL}/api/health/refills`);
  if (!res.ok) throw new Error("Failed to fetch medication refills");
  return res.json();
}

export async function fillFormFromDocument(simulatePdf?: string, documentUrl?: string) {
  const res = await fetch(`${BASE_URL}/api/forms/fill-from-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ simulate_pdf: simulatePdf, document_url: documentUrl }),
  });
  if (!res.ok) throw new Error("Failed to fill form from document");
  return res.json();
}

