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

module.exports = db;
