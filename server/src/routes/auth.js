import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

authRouter.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  const errors = {};
  if (!name || !name.trim()) errors.name = 'O nome é obrigatório';
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Informe um e-mail válido';
  if (!password || password.length < 8) errors.password = 'A senha deve ter pelo menos 8 caracteres';
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Validation failed', errors });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(422).json({ error: 'Validation failed', errors: { email: 'Este e-mail já está cadastrado' } });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'owner')`)
    .run(name.trim(), email.toLowerCase(), passwordHash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ token: issueToken(user), user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(422).json({ error: 'Validation failed', errors: { email: 'E-mail e senha são obrigatórios' } });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  }
  res.json({ token: issueToken(user), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
