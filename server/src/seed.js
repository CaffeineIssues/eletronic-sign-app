import bcrypt from 'bcryptjs';
import { db } from './db.js';

const users = [
  { name: 'Admin', email: 'admin@example.com', password: 'password123', role: 'admin' },
  { name: 'Demo Owner', email: 'owner@example.com', password: 'password123', role: 'owner' },
];

for (const u of users) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (existing) {
    console.log(`User ${u.email} already exists, skipping`);
    continue;
  }
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    u.name,
    u.email,
    bcrypt.hashSync(u.password, 10),
    u.role
  );
  console.log(`Created ${u.role}: ${u.email} / ${u.password}`);
}
