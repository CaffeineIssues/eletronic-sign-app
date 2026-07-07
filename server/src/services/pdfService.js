import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db } from '../db.js';
import { config } from '../config.js';
import { getAuditLogs } from './auditService.js';

/**
 * Field positions are stored normalized (0..1) relative to the page size with
 * the origin at the top-left corner (matching the browser viewer). pdf-lib
 * uses a bottom-left origin in PDF points, so we convert here.
 */
function toPdfRect(field, page) {
  const { width: pw, height: ph } = page.getSize();
  const w = field.width * pw;
  const h = field.height * ph;
  const x = field.x_position * pw;
  const y = ph - field.y_position * ph - h;
  return { x, y, w, h };
}

export async function generateSignedPdf(documentId) {
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
  if (!document) throw new Error('Document not found');

  const owner = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(document.owner_id);
  const signers = db
    .prepare('SELECT * FROM document_signers WHERE document_id = ? ORDER BY id')
    .all(documentId);
  const fields = db
    .prepare('SELECT * FROM signature_fields WHERE document_id = ? ORDER BY id')
    .all(documentId);
  const signatures = db
    .prepare('SELECT * FROM signatures WHERE document_id = ? ORDER BY id')
    .all(documentId);

  const pdfBytes = fs.readFileSync(document.original_file_path);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const signatureBySigner = new Map(signatures.map((s) => [s.signer_id, s]));

  for (const field of fields) {
    if (!field.signed_at) continue;
    const page = pages[field.page_number - 1];
    if (!page) continue;
    const { x, y, w, h } = toPdfRect(field, page);

    if ((field.field_type === 'signature' || field.field_type === 'initials') && field.value?.startsWith('data:image')) {
      const base64 = field.value.split(',')[1];
      const imgBytes = Buffer.from(base64, 'base64');
      const image = field.value.startsWith('data:image/jpeg')
        ? await pdfDoc.embedJpg(imgBytes)
        : await pdfDoc.embedPng(imgBytes);
      // Fit the image inside the field box preserving aspect ratio.
      const scale = Math.min(w / image.width, h / image.height);
      const dw = image.width * scale;
      const dh = image.height * scale;
      page.drawImage(image, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
    } else if (field.value) {
      const fontSize = Math.min(Math.max(h * 0.5, 8), 14);
      page.drawText(String(field.value), {
        x: x + 2,
        y: y + (h - fontSize) / 2,
        size: fontSize,
        font: helvetica,
        color: rgb(0.1, 0.1, 0.2),
        maxWidth: w - 4,
      });
    }
  }

  // ---- Audit trail page(s) ----
  const auditLogs = getAuditLogs(documentId);
  const A4 = [595.28, 841.89];
  const margin = 48;
  let page = pdfDoc.addPage(A4);
  let cursorY = A4[1] - margin;

  const ensureSpace = (needed) => {
    if (cursorY - needed < margin) {
      page = pdfDoc.addPage(A4);
      cursorY = A4[1] - margin;
    }
  };
  const drawLine = (text, { size = 10, font = helvetica, color = rgb(0.15, 0.15, 0.2), indent = 0, gap = 5 } = {}) => {
    ensureSpace(size + gap);
    page.drawText(text, { x: margin + indent, y: cursorY - size, size, font, color, maxWidth: A4[0] - margin * 2 - indent });
    cursorY -= size + gap;
  };

  const docHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
  const completedAt = new Date().toISOString();

  drawLine('Signature Certificate & Audit Trail', { size: 18, font: helveticaBold, color: rgb(0.2, 0.2, 0.45), gap: 14 });
  drawLine(`Document: ${document.title}`, { size: 11, font: helveticaBold });
  drawLine(`Document ID: ${document.id}`);
  drawLine(`Owner: ${owner.name} (${owner.email})`);
  drawLine(`Original file SHA-256: ${docHash.slice(0, 32)}`, { size: 8 });
  drawLine(`                       ${docHash.slice(32)}`, { size: 8 });
  drawLine(`Completion date: ${completedAt}`, { gap: 16 });

  drawLine('Signers', { size: 13, font: helveticaBold, gap: 8 });
  for (const signer of signers) {
    const sig = signatureBySigner.get(signer.id);
    drawLine(`${signer.name} <${signer.email}>`, { size: 10, font: helveticaBold, gap: 4 });
    if (sig) {
      drawLine(`Signed at: ${sig.signed_at} (UTC)`, { indent: 14, size: 9, gap: 3 });
      drawLine(`Method: ${sig.method}    IP address: ${sig.ip_address || 'n/a'}`, { indent: 14, size: 9, gap: 3 });
      drawLine(`User agent: ${(sig.user_agent || 'n/a').slice(0, 100)}`, { indent: 14, size: 9, gap: 3 });
      drawLine(`Consent: ${sig.consent_given ? 'Given' : 'Not given'} — "${sig.consent_text || ''}"`, { indent: 14, size: 9, gap: 10 });
    } else {
      drawLine('Not signed', { indent: 14, size: 9, gap: 10 });
    }
  }

  cursorY -= 6;
  drawLine('Event history', { size: 13, font: helveticaBold, gap: 8 });
  for (const log of auditLogs) {
    const actor = log.signer_name || log.user_name || 'system';
    drawLine(`${log.created_at} UTC — ${log.event} — ${actor}`, { size: 9, font: helveticaBold, gap: 3 });
    if (log.description) drawLine(log.description.slice(0, 120), { indent: 14, size: 8, gap: 3 });
    if (log.ip_address) drawLine(`IP: ${log.ip_address}  UA: ${(log.user_agent || '').slice(0, 90)}`, { indent: 14, size: 8, gap: 6 });
    else cursorY -= 3;
  }

  const outBytes = await pdfDoc.save();
  const fileName = `signed-${document.id}-${Date.now()}.pdf`;
  const outPath = path.join(config.signedDir, fileName);
  fs.writeFileSync(outPath, outBytes);
  return outPath;
}
