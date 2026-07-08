import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.warn(`[email] SMTP not configured, skipping email to ${to}: ${subject}`);
    return { skipped: true };
  }
  await t.sendMail({ from: config.smtp.from, to, subject, html });
  return { sent: true };
}

/**
 * Send a WhatsApp text message through the 360dialog Cloud API.
 * Docs: https://docs.360dialog.com/ (POST /messages with D360-API-KEY header)
 */
async function sendWhatsApp({ to, body }) {
  if (!config.d360.apiKey) {
    console.warn(`[whatsapp] 360dialog not configured, skipping message to ${to}`);
    return { skipped: true };
  }
  const res = await fetch(`${config.d360.apiUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'D360-API-KEY': config.d360.apiKey,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/[^0-9]/g, ''),
      type: 'text',
      text: { preview_url: true, body },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`360dialog error ${res.status}: ${text}`);
  }
  return { sent: true };
}

const LOGO_URL = 'https://julipet24horas.com.br/assets/logo-black-Do9LfRLl.svg';

function layout(title, bodyHtml) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
    <img src="${LOGO_URL}" alt="JuliPet — Clínica Veterinária" style="height:44px;margin-bottom:20px" />
    <h2 style="color:#111827;margin-bottom:16px">${title}</h2>
    ${bodyHtml}
    <p style="color:#9ca3af;font-size:12px;margin-top:32px">
      Esta mensagem foi enviada pela JuliPet. Se você não a esperava, pode ignorá-la.
    </p>
  </div>`;
}

export async function notifySigningRequest({ signer, document, ownerName, signingUrl }) {
  const results = { email: null, whatsapp: null };
  const emailHtml = layout(
    'Você tem um documento para assinar',
    `<p>Olá, ${signer.name}!</p>
     <p><strong>${ownerName}</strong> solicitou sua assinatura no documento
        <strong>${document.title}</strong>.</p>
     <p style="margin:24px 0">
       <a href="${signingUrl}"
          style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">
         Revisar e assinar documento
       </a>
     </p>
     <p style="font-size:13px;color:#6b7280">Ou copie este link: ${signingUrl}</p>
     <p style="font-size:13px;color:#6b7280">Este link é exclusivo para você. Não o compartilhe.</p>`
  );
  try {
    results.email = await sendEmail({
      to: signer.email,
      subject: `Assinatura solicitada: ${document.title}`,
      html: emailHtml,
    });
    if (results.email?.skipped) {
      // Dev convenience: without SMTP the link would otherwise be unreachable.
      console.log(`[email] signing link for ${signer.email}: ${signingUrl}`);
    }
  } catch (err) {
    console.error('[email] failed:', err.message);
    results.email = { error: err.message };
  }

  if (signer.phone) {
    try {
      results.whatsapp = await sendWhatsApp({
        to: signer.phone,
        body: `Olá, ${signer.name}! ${ownerName} solicitou sua assinatura no documento "${document.title}". Assine aqui: ${signingUrl}`,
      });
    } catch (err) {
      console.error('[whatsapp] failed:', err.message);
      results.whatsapp = { error: err.message };
    }
  }
  return results;
}

export async function notifyOwnerSignerCompleted({ owner, document, signer }) {
  try {
    await sendEmail({
      to: owner.email,
      subject: `${signer.name} assinou "${document.title}"`,
      html: layout(
        'Um signatário concluiu a assinatura',
        `<p>Olá, ${owner.name}!</p>
         <p><strong>${signer.name}</strong> (${signer.email}) assinou o documento
            <strong>${document.title}</strong>.</p>`
      ),
    });
  } catch (err) {
    console.error('[email] failed:', err.message);
  }
}

export async function notifyOwnerDocumentCompleted({ owner, document }) {
  try {
    await sendEmail({
      to: owner.email,
      subject: `Documento concluído: ${document.title}`,
      html: layout(
        'Seu documento foi totalmente assinado',
        `<p>Olá, ${owner.name}!</p>
         <p>Todos os signatários concluíram <strong>${document.title}</strong>.
            O PDF final assinado, com a trilha de auditoria, já está disponível para download no seu painel.</p>`
      ),
    });
  } catch (err) {
    console.error('[email] failed:', err.message);
  }
}
