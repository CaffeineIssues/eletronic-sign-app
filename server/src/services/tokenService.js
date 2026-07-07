import crypto from 'node:crypto';
import { config } from '../config.js';

// Raw tokens are only ever sent to the signer; the database stores a SHA-256 hash.
export function generateSigningToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function tokenExpiryDate() {
  const expires = new Date(Date.now() + config.signingTokenExpiryHours * 60 * 60 * 1000);
  return expires.toISOString();
}

export function isExpired(isoDate) {
  if (!isoDate) return true;
  return new Date(isoDate).getTime() < Date.now();
}

export function signingLinkUrl(token) {
  return `${config.appUrl}/sign/${token}`;
}
