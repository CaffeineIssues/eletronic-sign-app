import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(config.storageDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(config.signedDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('admin', 'owner', 'signer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_signature', 'completed', 'cancelled')),
  owner_id INTEGER NOT NULL REFERENCES users(id),
  original_file_path TEXT NOT NULL,
  signed_file_path TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_signers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  token_hash TEXT UNIQUE,
  token_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'viewed', 'signed')),
  signed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signature_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signer_id INTEGER NOT NULL REFERENCES document_signers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  x_position REAL NOT NULL,
  y_position REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'signature'
    CHECK (field_type IN ('signature', 'initials', 'date', 'text')),
  required INTEGER NOT NULL DEFAULT 1,
  value TEXT,
  signed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signer_id INTEGER NOT NULL REFERENCES document_signers(id) ON DELETE CASCADE,
  signature_image TEXT,
  method TEXT NOT NULL CHECK (method IN ('drawn', 'typed', 'uploaded')),
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  consent_given INTEGER NOT NULL DEFAULT 0,
  consent_text TEXT,
  signed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  signer_id INTEGER REFERENCES document_signers(id),
  event TEXT NOT NULL,
  description TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_signers_document ON document_signers(document_id);
CREATE INDEX IF NOT EXISTS idx_fields_document ON signature_fields(document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_document ON audit_logs(document_id);
`);

export function touchDocument(documentId) {
  db.prepare(`UPDATE documents SET updated_at = datetime('now') WHERE id = ?`).run(documentId);
}
