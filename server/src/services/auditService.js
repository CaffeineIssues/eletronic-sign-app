import { db } from '../db.js';

export const AUDIT_EVENTS = {
  DOCUMENT_UPLOADED: 'document_uploaded',
  SIGNER_ADDED: 'signer_added',
  SIGNING_LINK_SENT: 'signing_link_sent',
  DOCUMENT_VIEWED: 'document_viewed',
  SIGNATURE_STARTED: 'signature_started',
  SIGNATURE_COMPLETED: 'signature_completed',
  DOCUMENT_COMPLETED: 'document_completed',
  DOCUMENT_CANCELLED: 'document_cancelled',
};

export function logAudit({
  documentId,
  userId = null,
  signerId = null,
  event,
  description = '',
  req = null,
  metadata = null,
}) {
  db.prepare(
    `INSERT INTO audit_logs (document_id, user_id, signer_id, event, description, ip_address, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    documentId,
    userId,
    signerId,
    event,
    description,
    req ? clientIp(req) : null,
    req ? req.get('user-agent') || null : null,
    metadata ? JSON.stringify(metadata) : null
  );
}

export function clientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

export function getAuditLogs(documentId) {
  return db
    .prepare(
      `SELECT a.*, u.name AS user_name, s.name AS signer_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN document_signers s ON s.id = a.signer_id
       WHERE a.document_id = ?
       ORDER BY a.created_at ASC, a.id ASC`
    )
    .all(documentId)
    .map((row) => ({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) : null }));
}
