import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db.js';

export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db
      .prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?')
      .get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Loads the document and enforces access: admins see everything, owners see
 * their own documents. Attaches it to req.document.
 */
export function loadDocument(req, res, next) {
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!document) return res.status(404).json({ error: 'Document not found' });
  if (req.user.role !== 'admin' && document.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not have access to this document' });
  }
  req.document = document;
  next();
}
