import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(serverRoot, '.env') });

const storageDir = process.env.STORAGE_DIR
  ? path.resolve(serverRoot, process.env.STORAGE_DIR)
  : path.join(serverRoot, 'storage');

export const config = {
  port: Number(process.env.PORT || 4000),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  storageDir,
  dbPath: path.join(storageDir, 'esign.sqlite'),
  uploadsDir: path.join(storageDir, 'uploads'),
  signedDir: path.join(storageDir, 'signed'),
  signingTokenExpiryHours: Number(process.env.SIGNING_TOKEN_EXPIRY_HOURS || 168),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'eSign App <no-reply@example.com>',
  },
  d360: {
    apiKey: process.env.D360_API_KEY || '',
    apiUrl: process.env.D360_API_URL || 'https://waba-v2.360dialog.io',
  },
};
