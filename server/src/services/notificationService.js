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

function layout(title, bodyHtml) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="color:#111827;margin-bottom:16px">${title}</h2>
    ${bodyHtml}
    <p style="color:#9ca3af;font-size:12px;margin-top:32px">
      This message was sent by the eSign App. If you were not expecting it you can ignore it.
    </p>
  </div>`;
}

export async function notifySigningRequest({ signer, document, ownerName, signingUrl }) {
  const results = { email: null, whatsapp: null };
  const emailHtml = layout(
    'You have a document to sign',
    `<p>Hi ${signer.name},</p>
     <p><strong>${ownerName}</strong> has requested your signature on
        <strong>${document.title}</strong>.</p>
     <p style="margin:24px 0">
       <a href="${signingUrl}"
          style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">
         Review &amp; Sign Document
       </a>
     </p>
     <p style="font-size:13px;color:#6b7280">Or copy this link: ${signingUrl}</p>
     <p style="font-size:13px;color:#6b7280">This link is unique to you. Do not share it.</p>`
  );
  try {
    results.email = await sendEmail({
      to: signer.email,
      subject: `Signature requested: ${document.title}`,
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
        body: `Hi ${signer.name}, ${ownerName} has requested your signature on "${document.title}". Sign here: ${signingUrl}`,
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
      subject: `${signer.name} signed "${document.title}"`,
      html: layout(
        'A signer has completed signing',
        `<p>Hi ${owner.name},</p>
         <p><strong>${signer.name}</strong> (${signer.email}) has signed
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
      subject: `Document completed: ${document.title}`,
      html: layout(
        'Your document is fully signed',
        `<p>Hi ${owner.name},</p>
         <p>All signers have completed <strong>${document.title}</strong>.
            The final signed PDF with the audit trail is ready for download in your dashboard.</p>`
      ),
    });
  } catch (err) {
    console.error('[email] failed:', err.message);
  }
}
