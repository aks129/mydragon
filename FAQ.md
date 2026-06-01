# FHIR-IQ MVP FAQ & Best Practice Guidelines

This document provides answers to common architectural, clinical, and security questions regarding the **FHIR-IQ** autonomous healthcare agent application.

---

## 🔒 Security & HIPAA Compliance

### Q1: How does the application handle patient PHI in compliance with HIPAA?
FHIR-IQ enforces a strict **zero-trust perimeter for Protected Health Information (PHI)** before any third-party or logical reasoning service is called. 
- **HealthClaw Safe Harbor Redactor**: Before any FHIR data is exposed to LLM APIs (like Google Gemini) or voice dialers (like Bland.ai), it is passed through the `HealthClaw` compilation routing. This replaces all 18 identifiers defined under the HIPAA Safe Harbor standard (such as names, specific dates, phone numbers, and full zip codes) with timing-safe hashes.
- **Side-by-Side Verification**: The EHR Vault tab displays this in real-time, showing the original resource payload alongside the redacted safe version to verify compliance.

### Q2: Are the developer credentials (FASTEN_PRIVATE_KEY, GEMINI_API_KEY) exposed to the client app?
**No.** All API integrations (Gemini logical agents, Bland.ai call dispatches, Fasten EHI syncs) are executed entirely on the server side. The React Native and React Web clients communicate with the backend using session authentication, preventing any developer API keys or private certificates from being leaked to the client bundle.

---

## 📂 Fasten Health EHR Linkages

### Q3: How do we authenticate with external hospital networks (Epic, Kaiser)?
We utilize **Fasten Health Connect's Stitch Web Component** (which is compliant with HL7 FHIR Smart-on-FHIR specifications).
- On mobile, this is rendered inside a native slide-up bottom sheet containing a secure React Native `WebView`.
- On the web dashboard, it loads inside an iframe modal.
- The user selects their medical institution (e.g., Epic Sandbox), signs in using their clinical credentials, and approves data access.
- The widget sends a message back (`connection.success`) containing an `org_connection_id`, which the backend uses to request EHI exports.

### Q4: How is patient health data synced after connecting?
Fasten triggers an **EHI (Export Health Information) bulk export** job. The backend receives a callback or polls the export endpoint. Once complete, it downloads the clinical records in NDJSON format, parses the resources (Conditions, Observations, Medications), and saves them in the database associated with the patient.

---

## 📞 Bland.ai Outbound Voice Webhooks

### Q5: How does the webhook ensure that callbacks are authentic?
To protect against malicious payloads claiming to be Bland.ai call completions, the backend `/api/calls/webhook` endpoint validates incoming headers using a **timing-safe HMAC-SHA256 signature verification**:
1. The server reads the webhook signing secret from `FASTEN_WEBHOOK_SECRET`.
2. It parses the incoming signature header (`x-fasten-signature` or `Webhook-Signature`).
3. It computes the SHA-256 HMAC of the raw request payload and verifies it matches the header signature using `hmac.compare_digest`. This timing-safe comparison prevents side-channel analysis.

---

## ☁️ Google Cloud Run Server Operations

### Q6: What happens to the database when the Cloud Run container scales down?
Google Cloud Run is a **stateless, serverless container environment**. This means any changes written to the local SQLite database (`healthcare.db`) inside the running container are lost when the instance scales down to zero.
- **MVP Design Solution**: To ensure a flawless hackathon testing experience, the backend auto-checks for the database on boot. If missing, it automatically creates the SQLite tables and seeds them with mock patient records, appointment slots, and care gap reports.
- **Production Road-Map**: For production, the database connection (`get_db_connection`) would be pointed to a managed SQL database instance (such as Cloud SQL PostgreSQL) using Google Cloud Data Connect rules.

---

## 🧠 Google Antigravity Agent (Robin)

### Q7: How does Robin's logical reasoning drawer get its logs?
Robin uses the **Google Antigravity SDK**, which exposes an agentic harness. When the user sends a chat prompt, the agent compiles a list of thoughts (reasoning steps) alongside its final text response. 
- In the mobile app, these thought steps are animated inside a drop-down panel.
- In the web dashboard, they are streamed in real-time to the **Reasonings Drawer** on the right side of the screen, showcasing the agent's logic (e.g. *"Checking care gaps database..."*, *"Scanning for retired ICD codes..."*, *"Invoking scheduling calendar tool..."*).
