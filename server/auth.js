const db = require('./db');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

function formatAccount(row) {
  const expToNext = (row.level || 1) * 100;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    level: row.level || 1,
    exp: row.exp || 0,
    expToNext,
    gold: row.gold || 0,
    accountType: row.account_type || 'basic',
    isAdmin: row.is_admin || 0
  };
}

function register(username, password, displayName) {
  if (!username || !password) return { ok: false, error: 'Username and password required' };
  if (username.length < 2 || username.length > 20) return { ok: false, error: 'Username must be 2-20 characters' };
  if (password.length < 4) return { ok: false, error: 'Password must be at least 4 characters' };

  const existing = db.prepare('SELECT id FROM accounts WHERE username = ?').get(username);
  if (existing) return { ok: false, error: 'Username already taken' };

  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const name = (displayName || '').trim() || username;
  const info = db.prepare('INSERT INTO accounts (username, password, display_name) VALUES (?, ?, ?)').run(username, hash, name);

  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(info.lastInsertRowid);
  return { ok: true, account: formatAccount(row) };
}

function login(username, password) {
  if (!username || !password) return { ok: false, error: 'Username and password required' };

  const row = db.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
  if (!row) return { ok: false, error: 'Invalid username or password' };

  const match = bcrypt.compareSync(password, row.password);
  if (!match) return { ok: false, error: 'Invalid username or password' };

  return { ok: true, account: formatAccount(row) };
}

module.exports = { register, login };
