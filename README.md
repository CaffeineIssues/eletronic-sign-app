# JuliPet — Assinatura Eletrônica

A lightweight electronic-signature web app. Document owners upload PDFs, place signature fields visually, and send secure signing links by email (SMTP) and WhatsApp (360dialog). Signers draw, type, or upload a signature; once everyone signs, a final PDF is generated with the signatures stamped in place plus a certificate page containing the full audit trail.

## Stack

| Part | Tech |
| --- | --- |
| Backend | Node.js, Express 5, better-sqlite3 (SQLite), pdf-lib, nodemailer, JWT |
| Frontend | React 19 (Vite), react-router, pdfjs-dist (viewer), signature_pad |
| Notifications | SMTP email + WhatsApp via the 360dialog Cloud API |

## Project layout

```
server/            Express API
  src/index.js     App entry, route mounting, error handler
  src/db.js        SQLite schema (users, documents, document_signers,
                   signature_fields, signatures, audit_logs)
  src/routes/      auth, documents (owner APIs), signing (public token APIs)
  src/services/    audit log, signing tokens, notifications, signed-PDF generation
  src/middleware/  JWT auth, role checks, document access policy
client/            React SPA (Vite, proxies /api to the server)
  src/pages/       Login, Register, Dashboard, Documents, Upload,
                   DocumentDetail (+ audit trail), FieldEditor, SignPage
  src/components/  Layout, PdfViewer, DocumentsTable, StatusBadge, Modal, …
```

## Getting started

```bash
# 1. API
cd server
npm install
cp .env.example .env        # fill in SMTP / 360dialog credentials as needed
npm run seed                # optional: creates admin@example.com / owner@example.com (password123)
npm run dev                 # http://localhost:4000

# 2. Web app (separate terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

Email and WhatsApp sending are skipped gracefully (logged to the server console) when `SMTP_HOST` / `D360_API_KEY` are not configured, so the full flow can be exercised locally without credentials.

## Configuration (`server/.env`)

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Base URL used inside signing links (the frontend origin) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Auth token signing |
| `SIGNING_TOKEN_EXPIRY_HOURS` | Lifetime of signing links (default 168h) |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM` | Outgoing email |
| `D360_API_KEY`, `D360_API_URL` | WhatsApp via 360dialog |
| `STORAGE_DIR` | Where the SQLite DB and PDFs are stored |

## How it works

1. **Upload** — owner uploads a PDF (validated by MIME type and `%PDF-` magic bytes) and it appears on the dashboard as a `draft`.
2. **Signers & fields** — owner adds signers (name, email, optional WhatsApp number) and places signature / initials / date / text fields on the PDF in the visual editor. Positions are stored normalized (0–1) so they are resolution-independent.
3. **Send** — each pending signer gets a unique 256-bit token link. Only the SHA-256 hash of the token is stored; links expire after `SIGNING_TOKEN_EXPIRY_HOURS`.
4. **Sign** — the signer opens the link, reviews the PDF with their fields highlighted, signs (draw / type / upload), and must confirm: *"I agree that this electronic signature has the same legal effect as a handwritten signature."* IP address, user agent, timestamp, method, and consent are recorded.
5. **Complete** — when the last signer finishes, the server stamps every signature into the PDF with pdf-lib, appends a Signature Certificate page (signers, timestamps, IPs, user agents, methods, consent, event history, original-file SHA-256), stores it, and marks the document `completed`. The owner is notified at each step.

Every event (`document_uploaded`, `signer_added`, `signing_link_sent`, `document_viewed`, `signature_started`, `signature_completed`, `document_completed`, `document_cancelled`) is written to `audit_logs` and visible in the document's Audit trail tab.

## Roles

- **owner** — default role at registration; can upload and manage their own documents.
- **admin** — can see and manage all documents.
- **signer** — signers do not need an account; access is via secure token links only. If a signer's email matches a registered user they are linked via `user_id`.
