import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { db, touchDocument } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole, loadDocument } from '../middleware/auth.js';
import { AUDIT_EVENTS, logAudit, getAuditLogs } from '../services/auditService.js';
import { generateSigningToken, tokenExpiryDate, signingLinkUrl } from '../services/tokenService.js';
import { notifySigningRequest } from '../services/notificationService.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth, requireRole('admin', 'owner'));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.pdf`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Apenas arquivos PDF são permitidos'));
    cb(null, true);
  },
});

function isPdfFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(5);
    fs.readSync(fd, buf, 0, 5, 0);
    return buf.toString('latin1') === '%PDF-';
  } finally {
    fs.closeSync(fd);
  }
}

function documentSummary(doc) {
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) AS signed
       FROM document_signers WHERE document_id = ?`
    )
    .get(doc.id);
  return {
    ...doc,
    signer_count: counts.total || 0,
    signed_count: counts.signed || 0,
  };
}

function fullDocument(doc) {
  const signers = db
    .prepare(
      `SELECT id, document_id, user_id, name, email, phone, status, signed_at,
              token_expires_at, created_at
       FROM document_signers WHERE document_id = ? ORDER BY id`
    )
    .all(doc.id);
  const fields = db
    .prepare('SELECT * FROM signature_fields WHERE document_id = ? ORDER BY id')
    .all(doc.id);
  const signatures = db
    .prepare(
      `SELECT id, signer_id, method, signer_name, signer_email, ip_address, user_agent,
              consent_given, signed_at
       FROM signatures WHERE document_id = ? ORDER BY id`
    )
    .all(doc.id);
  return { ...documentSummary(doc), signers, fields, signatures };
}

// ---- Dashboard stats ----
documentsRouter.get('/stats', (req, res) => {
  const where = req.user.role === 'admin' ? '' : 'WHERE owner_id = @ownerId';
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS count FROM documents ${where} GROUP BY status`)
    .all({ ownerId: req.user.id });
  const stats = { total: 0, draft: 0, pending_signature: 0, completed: 0, cancelled: 0 };
  for (const row of rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }
  res.json({ stats });
});

// ---- List documents ----
documentsRouter.get('/', (req, res) => {
  const where = req.user.role === 'admin' ? '' : 'WHERE owner_id = @ownerId';
  const docs = db
    .prepare(`SELECT * FROM documents ${where} ORDER BY created_at DESC, id DESC`)
    .all({ ownerId: req.user.id });
  res.json({ documents: docs.map(documentSummary) });
});

// ---- Upload document ----
documentsRouter.post('/', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(422).json({ error: 'Validation failed', errors: { file: 'Envie um arquivo PDF' } });
  if (!isPdfFile(file.path)) {
    fs.unlinkSync(file.path);
    return res.status(422).json({ error: 'Validation failed', errors: { file: 'O arquivo enviado não é um PDF válido' } });
  }
  const title = (req.body.title || '').trim() || path.parse(file.originalname).name;

  const result = db
    .prepare(`INSERT INTO documents (title, owner_id, original_file_path) VALUES (?, ?, ?)`)
    .run(title, req.user.id, file.path);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);

  logAudit({
    documentId: doc.id,
    userId: req.user.id,
    event: AUDIT_EVENTS.DOCUMENT_UPLOADED,
    description: `Documento "${title}" enviado por ${req.user.name}`,
    req,
    metadata: { original_name: file.originalname, size: file.size },
  });

  res.status(201).json({ document: documentSummary(doc) });
});

// ---- Document detail ----
documentsRouter.get('/:id', loadDocument, (req, res) => {
  res.json({ document: fullDocument(req.document) });
});

// ---- Stream original PDF ----
documentsRouter.get('/:id/file', loadDocument, (req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(req.document.original_file_path).pipe(res);
});

// ---- Download signed PDF ----
documentsRouter.get('/:id/signed-file', loadDocument, (req, res) => {
  if (!req.document.signed_file_path || !fs.existsSync(req.document.signed_file_path)) {
    return res.status(404).json({ error: 'O PDF assinado ainda não está disponível' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${req.document.title.replace(/[^a-zA-Z0-9 _-]/g, '')} (assinado).pdf"`
  );
  fs.createReadStream(req.document.signed_file_path).pipe(res);
});

// ---- Audit trail ----
documentsRouter.get('/:id/audit', loadDocument, (req, res) => {
  res.json({ logs: getAuditLogs(req.document.id) });
});

// ---- Add signer ----
documentsRouter.post('/:id/signers', loadDocument, (req, res) => {
  if (!['draft', 'pending_signature'].includes(req.document.status)) {
    return res.status(409).json({ error: 'Signatários só podem ser adicionados a documentos em rascunho ou pendentes' });
  }
  const { name, email, phone } = req.body || {};
  const errors = {};
  if (!name || !name.trim()) errors.name = 'O nome é obrigatório';
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Informe um e-mail válido';
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Validation failed', errors });

  const duplicate = db
    .prepare('SELECT id FROM document_signers WHERE document_id = ? AND email = ?')
    .get(req.document.id, email.toLowerCase());
  if (duplicate) {
    return res.status(422).json({ error: 'Validation failed', errors: { email: 'Este signatário já foi adicionado' } });
  }

  const linkedUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  const result = db
    .prepare(
      `INSERT INTO document_signers (document_id, user_id, name, email, phone)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.document.id, linkedUser?.id ?? null, name.trim(), email.toLowerCase(), (phone || '').trim() || null);

  logAudit({
    documentId: req.document.id,
    userId: req.user.id,
    signerId: result.lastInsertRowid,
    event: AUDIT_EVENTS.SIGNER_ADDED,
    description: `Signatário ${name.trim()} <${email.toLowerCase()}> adicionado`,
    req,
  });
  touchDocument(req.document.id);

  const signer = db
    .prepare('SELECT id, document_id, user_id, name, email, phone, status, signed_at, created_at FROM document_signers WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json({ signer });
});

// ---- Remove signer ----
documentsRouter.delete('/:id/signers/:signerId', loadDocument, (req, res) => {
  if (req.document.status !== 'draft') {
    return res.status(409).json({ error: 'Signatários só podem ser removidos enquanto o documento estiver em rascunho' });
  }
  const signer = db
    .prepare('SELECT * FROM document_signers WHERE id = ? AND document_id = ?')
    .get(req.params.signerId, req.document.id);
  if (!signer) return res.status(404).json({ error: 'Signatário não encontrado' });
  db.prepare('DELETE FROM document_signers WHERE id = ?').run(signer.id);
  touchDocument(req.document.id);
  res.json({ ok: true });
});

// ---- Save signature fields (replace-all while draft) ----
documentsRouter.put('/:id/fields', loadDocument, (req, res) => {
  if (req.document.status !== 'draft') {
    return res.status(409).json({ error: 'Os campos só podem ser editados enquanto o documento estiver em rascunho' });
  }
  const fields = Array.isArray(req.body?.fields) ? req.body.fields : null;
  if (!fields) return res.status(422).json({ error: 'Validation failed', errors: { fields: 'A lista de campos é obrigatória' } });

  const validTypes = ['signature', 'initials', 'date', 'text'];
  const signerIds = new Set(
    db.prepare('SELECT id FROM document_signers WHERE document_id = ?').all(req.document.id).map((r) => r.id)
  );
  for (const f of fields) {
    if (!signerIds.has(Number(f.signer_id))) {
      return res.status(422).json({ error: 'Validation failed', errors: { fields: `Signatário desconhecido para o campo` } });
    }
    if (!validTypes.includes(f.field_type)) {
      return res.status(422).json({ error: 'Validation failed', errors: { fields: `Tipo de campo inválido "${f.field_type}"` } });
    }
  }

  const replaceAll = db.transaction(() => {
    db.prepare('DELETE FROM signature_fields WHERE document_id = ?').run(req.document.id);
    const insert = db.prepare(
      `INSERT INTO signature_fields
         (document_id, signer_id, page_number, x_position, y_position, width, height, field_type, required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const f of fields) {
      insert.run(
        req.document.id,
        Number(f.signer_id),
        Math.max(1, Number(f.page_number) || 1),
        Number(f.x_position),
        Number(f.y_position),
        Number(f.width),
        Number(f.height),
        f.field_type,
        f.required === false ? 0 : 1
      );
    }
  });
  replaceAll();
  touchDocument(req.document.id);

  const saved = db.prepare('SELECT * FROM signature_fields WHERE document_id = ? ORDER BY id').all(req.document.id);
  res.json({ fields: saved });
});

// ---- Send for signature ----
documentsRouter.post('/:id/send', loadDocument, async (req, res) => {
  if (!['draft', 'pending_signature'].includes(req.document.status)) {
    return res.status(409).json({ error: 'Este documento não pode ser enviado no status atual' });
  }
  const signers = db
    .prepare(`SELECT * FROM document_signers WHERE document_id = ? AND status != 'signed'`)
    .all(req.document.id);
  const allSigners = db
    .prepare('SELECT COUNT(*) AS c FROM document_signers WHERE document_id = ?')
    .get(req.document.id);
  if (!allSigners.c) return res.status(422).json({ error: 'Adicione pelo menos um signatário antes de enviar' });

  const fieldCount = db
    .prepare('SELECT COUNT(*) AS c FROM signature_fields WHERE document_id = ?')
    .get(req.document.id);
  if (!fieldCount.c) return res.status(422).json({ error: 'Posicione pelo menos um campo de assinatura antes de enviar' });

  const deliveries = [];
  for (const signer of signers) {
    const { token, tokenHash } = generateSigningToken();
    const expiresAt = tokenExpiryDate();
    db.prepare(
      `UPDATE document_signers
       SET token_hash = ?, token_expires_at = ?, status = 'sent', updated_at = datetime('now')
       WHERE id = ?`
    ).run(tokenHash, expiresAt, signer.id);

    const url = signingLinkUrl(token);
    const result = await notifySigningRequest({
      signer,
      document: req.document,
      ownerName: req.user.name,
      signingUrl: url,
    });

    logAudit({
      documentId: req.document.id,
      userId: req.user.id,
      signerId: signer.id,
      event: AUDIT_EVENTS.SIGNING_LINK_SENT,
      description: `Link de assinatura enviado para ${signer.name} <${signer.email}>`,
      req,
      metadata: { email: result.email, whatsapp: result.whatsapp, expires_at: expiresAt },
    });

    deliveries.push({ signer_id: signer.id, email: result.email, whatsapp: result.whatsapp });
  }

  db.prepare(`UPDATE documents SET status = 'pending_signature', updated_at = datetime('now') WHERE id = ?`).run(
    req.document.id
  );
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.document.id);
  res.json({ document: documentSummary(doc), deliveries });
});

// ---- Cancel ----
documentsRouter.post('/:id/cancel', loadDocument, (req, res) => {
  if (req.document.status === 'completed') {
    return res.status(409).json({ error: 'Documentos concluídos não podem ser cancelados' });
  }
  if (req.document.status === 'cancelled') {
    return res.status(409).json({ error: 'Este documento já foi cancelado' });
  }
  db.prepare(`UPDATE documents SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(
    req.document.id
  );
  // Invalidate outstanding signing links.
  db.prepare(
    `UPDATE document_signers SET token_hash = NULL, token_expires_at = NULL, updated_at = datetime('now')
     WHERE document_id = ? AND status != 'signed'`
  ).run(req.document.id);

  logAudit({
    documentId: req.document.id,
    userId: req.user.id,
    event: AUDIT_EVENTS.DOCUMENT_CANCELLED,
    description: `Documento cancelado por ${req.user.name}`,
    req,
  });

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.document.id);
  res.json({ document: documentSummary(doc) });
});
