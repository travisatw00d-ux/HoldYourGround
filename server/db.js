const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'accounts.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password      TEXT NOT NULL,
    display_name  TEXT DEFAULT '',
    is_admin      INTEGER DEFAULT 0,
    account_type  TEXT DEFAULT 'basic',
    level         INTEGER DEFAULT 1,
    exp           INTEGER DEFAULT 0,
    gold          INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now'))
  )
`);

try { db.exec('ALTER TABLE accounts ADD COLUMN display_name TEXT DEFAULT \'\''); } catch (e) {}
try { db.exec('ALTER TABLE accounts ADD COLUMN level INTEGER DEFAULT 1'); } catch (e) {}
try { db.exec('ALTER TABLE accounts ADD COLUMN exp INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE accounts ADD COLUMN gold INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE accounts ADD COLUMN account_type TEXT DEFAULT \'basic\''); } catch (e) {}
try { db.exec('ALTER TABLE accounts ADD COLUMN cumulative_exp INTEGER DEFAULT 0'); } catch (e) {}

// One-time migration: backfill cumulative_exp from existing level/exp
try {
  const rows = db.prepare('SELECT id, level, exp FROM accounts WHERE cumulative_exp = 0 AND (level > 1 OR exp > 0)').all();
  const { cumulativeExp } = require('./exp');
  for (const row of rows) {
    const c = cumulativeExp(row.level, row.exp);
    db.prepare('UPDATE accounts SET cumulative_exp = ? WHERE id = ?').run(c, row.id);
  }
} catch (e) {}

module.exports = db;
