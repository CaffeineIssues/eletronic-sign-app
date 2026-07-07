import fs from 'node:fs';
import { Router } from 'express';
import { db, touchDocument } from '../db.js';
import { hashToken, isExpired } from '../services/tokenService.js';
import { AUDIT_EVENTS, logAudit, clientIp } from '../services/auditService.js';
import { generateSignedPdf } from '../services/pdfService.js';
import {
  notifyOwnerSignerCompleted,
  notifyOwnerDocumentCompleted,
} from '../services/notificationService.js';

export const signingRouter = Router();

const CONSENT_TEXT =
  'I agree that this electronic signature has the same legal effect as a handwritten signature.';

/** Resolve a raw signing token to signer + document, enforcing expiry and status. */
function resolveToken(req, res) {
  const tokenHash = hashToken(req.params.token);
  const signer = db.prepare('SELECT * FROM document_signers WHERE token_hash = ?').get(tokenHash);
  if (!signer) {
    res.status(404).json({ error: 'This signing link is invalid or has been revoked' });
    return null;
  }
  if (signer.status !== 'signed' && isExpired(signer.token_expires_at)) {
    res.status(410).json({ error: 'This signing link has expired. Ask the sender for a new one.' });
    return null;
  }
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(signer.document_id);
  if (!document || document.status === 'cancelled') {
    res.status(410).json({ error: 'This document is no longer available for signing' });
    return null;
  }
  return { signer, document };
}

// ---- Load signing session ----
signingRouter.get('/:token', (req, res) => {
  const resolved = resolveToken(req, res);
  if (!resolved) return;
  const { signer, document } = resolved;

  const fields = db
    .prepare('SELECT * FROM signature_fields WHERE document_id = ? AND signer_id = ? ORDER BY id')
    .all(document.id, signer.id);

  if (signer.status === 'sent') {
    db.prepare(`UPDATE document_signers SET status = 'viewed', updated_at = datetime('now') WHERE id = ?`).run(
      signer.id
    );
    logAudit({
      documentId: document.id,
      signerId: signer.id,
      event: AUDIT_EVENTS.DOCUMENT_VIEWED,
      description: `${signer.name} opened the document`,
      req,
    });
  }

  const owner = db.prepare('SELECT name FROM users WHERE id = ?').get(document.owner_id);
  res.json({
    document: { id: document.id, title: document.title, status: document.status, owner_name: owner?.name },
    signer: {
      id: signer.id,
      name: signer.name,
      email: signer.email,
      status: signer.status,
      signed_at: signer.signed_at,
    },
    fields,
    consent_text: CONSENT_TEXT,
  });
});

// ---- Stream the PDF for the signer ----
signingRouter.get('/:token/file', (req, res) => {
  const resolved = resolveToken(req, res);
  if (!resolved) return;
  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(resolved.document.original_file_path).pipe(res);
});

// ---- Mark that the signer started signing ----
signingRouter.post('/:token/start', (req, res) => {
  const resolved = resolveToken(req, res);
  if (!resolved) return;
  const { signer, document } = resolved;
  if (signer.status === 'signed') return res.status(409).json({ error: 'You have already signed this document' });
  logAudit({
    documentId: document.id,
    signerId: signer.id,
    event: AUDIT_EVENTS.SIGNATURE_STARTED,
    description: `${signer.name} started signing`,
    req,
  });
  res.json({ ok: true });
});

// ---- Complete signing ----
signingRouter.post('/:token/complete', async (req, res) => {
  const resolved = resolveToken(req, res);
  if (!resolved) return;
  const { signer, document } = resolved;

  if (signer.status === 'signed') {
    return res.status(409).json({ error: 'You have already signed this document' });
  }
  if (document.status !== 'pending_signature') {
    return res.status(409).json({ error: 'This document is not open for signing' });
  }

  const { consent, method, signature_image: signatureImage, field_values: fieldValues = {} } = req.body || {};
  if (consent !== true) {
    return res.status(422).json({ error: 'Validation failed', errors: { consent: 'You must accept the consent statement to sign' } });
  }
  if (!['drawn', 'typed', 'uploaded'].includes(method)) {
    return res.status(422).json({ error: 'Validation failed', errors: { method: 'Invalid signature method' } });
  }
  if (!signatureImage || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signatureImage)) {
    return res.status(422).json({ error: 'Validation failed', errors: { signature: 'A signature image is required' } });
  }
  if (Buffer.byteLength(signatureImage) > 2 * 1024 * 1024) {
    return res.status(422).json({ error: 'Validation failed', errors: { signature: 'Signature image is too large' } });
  }

  const fields = db
    .prepare('SELECT * FROM signature_fields WHERE document_id = ? AND signer_id = ? ORDER BY id')
    .all(document.id, signer.id);

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const resolveFieldValue = (field) => {
    switch (field.field_type) {
      case 'signature':
      case 'initials':
        return signatureImage;
      case 'date':
        return new Date().toISOString().slice(0, 10);
      case 'text':
        return typeof fieldValues[field.id] === 'string' ? fieldValues[field.id].slice(0, 200) : '';
      default:
        return '';
    }
  };

  for (const field of fields) {
    if (field.required && field.field_type === 'text' && !String(fieldValues[field.id] || '').trim()) {
      return res.status(422).json({
        error: 'Validation failed',
        errors: { [`field_${field.id}`]: 'This field is required' },
      });
    }
  }

  const ip = clientIp(req);
  const userAgent = req.get('user-agent') || null;

  const complete = db.transaction(() => {
    const updateField = db.prepare(
      `UPDATE signature_fields SET value = ?, signed_at = ? WHERE id = ?`
    );
    for (const field of fields) {
      updateField.run(resolveFieldValue(field), now, field.id);
    }

    db.prepare(
      `INSERT INTO signatures
         (document_id, signer_id, signature_image, method, signer_name, signer_email,
          ip_address, user_agent, consent_given, consent_text, signed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(document.id, signer.id, signatureImage, method, signer.name, signer.email, ip, userAgent, CONSENT_TEXT, now);

    db.prepare(
      `UPDATE document_signers SET status = 'signed', signed_at = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(now, signer.id);
  });
  complete();

  logAudit({
    documentId: document.id,
    signerId: signer.id,
    event: AUDIT_EVENTS.SIGNATURE_COMPLETED,
    description: `${signer.name} <${signer.email}> signed the document (${method})`,
    req,
    metadata: { method },
  });
  touchDocument(document.id);

  const owner = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(document.owner_id);
  notifyOwnerSignerCompleted({ owner, document, signer }).catch(() => {});

  // If every signer has signed, generate the final PDF and complete the document.
  const remaining = db
    .prepare(`SELECT COUNT(*) AS c FROM document_signers WHERE document_id = ? AND status != 'signed'`)
    .get(document.id);

  let documentCompleted = false;
  if (remaining.c === 0) {
    logAudit({
      documentId: document.id,
      event: AUDIT_EVENTS.DOCUMENT_COMPLETED,
      description: 'All signers completed. Final signed PDF generated.',
      req,
    });
    const signedPath = await generateSignedPdf(document.id);
    db.prepare(
      `UPDATE documents
       SET status = 'completed', signed_file_path = ?, completed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(signedPath, document.id);
    documentCompleted = true;
    notifyOwnerDocumentCompleted({ owner, document }).catch(() => {});
  }

  res.json({ ok: true, document_completed: documentCompleted });
});
