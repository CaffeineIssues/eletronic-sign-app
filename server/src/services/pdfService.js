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

  const METHOD_LABELS = { drawn: 'desenhada', typed: 'digitada', uploaded: 'imagem enviada' };
  const EVENT_LABELS = {
    document_uploaded: 'documento enviado',
    signer_added: 'signatário adicionado',
    signing_link_sent: 'link de assinatura enviado',
    document_viewed: 'documento visualizado',
    signature_started: 'assinatura iniciada',
    signature_completed: 'assinatura concluída',
    document_completed: 'documento concluído',
    document_cancelled: 'documento cancelado',
  };

  drawLine('Certificado de Assinatura e Trilha de Auditoria', { size: 18, font: helveticaBold, color: rgb(0.2, 0.2, 0.45), gap: 14 });
  drawLine(`Documento: ${document.title}`, { size: 11, font: helveticaBold });
  drawLine(`ID do documento: ${document.id}`);
  drawLine(`Proprietário: ${owner.name} (${owner.email})`);
  drawLine(`SHA-256 do arquivo original: ${docHash.slice(0, 32)}`, { size: 8 });
  drawLine(`                             ${docHash.slice(32)}`, { size: 8 });
  drawLine(`Data de conclusão: ${completedAt} (UTC)`, { gap: 16 });

  drawLine('Signatários', { size: 13, font: helveticaBold, gap: 8 });
  for (const signer of signers) {
    const sig = signatureBySigner.get(signer.id);
    drawLine(`${signer.name} <${signer.email}>`, { size: 10, font: helveticaBold, gap: 4 });
    if (sig) {
      drawLine(`Assinado em: ${sig.signed_at} (UTC)`, { indent: 14, size: 9, gap: 3 });
      drawLine(`Método: ${METHOD_LABELS[sig.method] || sig.method}    Endereço IP: ${sig.ip_address || 'n/d'}`, { indent: 14, size: 9, gap: 3 });
      drawLine(`Navegador (user agent): ${(sig.user_agent || 'n/d').slice(0, 100)}`, { indent: 14, size: 9, gap: 3 });
      drawLine(`Consentimento: ${sig.consent_given ? 'Concedido' : 'Não concedido'} — "${sig.consent_text || ''}"`, { indent: 14, size: 9, gap: 10 });
    } else {
      drawLine('Não assinado', { indent: 14, size: 9, gap: 10 });
    }
  }

  cursorY -= 6;
  drawLine('Histórico de eventos', { size: 13, font: helveticaBold, gap: 8 });
  for (const log of auditLogs) {
    const actor = log.signer_name || log.user_name || 'sistema';
    drawLine(`${log.created_at} UTC — ${EVENT_LABELS[log.event] || log.event} — ${actor}`, { size: 9, font: helveticaBold, gap: 3 });
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
