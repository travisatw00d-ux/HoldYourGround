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
// Persistent equipment (2026-07-12) — JSON blob of the 5 equip slots
// ({weapon, armor, ring, necklace, helmet}, same shape as
// playerMod.playerInfoObj(p).equipment), written by room.js's removePlayer()
// whenever a logged-in player leaves a room (disconnect or explicit
// leaveRoom) and read by player.js's addPlayer() on their next join. Guests
// (no account row) never read or write this — they always get the
// CLASS_LOADOUTS starter gear, same as before this feature existed. The bag
// (p.inventorySlots) is deliberately NOT persisted here or anywhere — per
// design, only equip-slot items survive across matches.
try { db.exec('ALTER TABLE accounts ADD COLUMN equipment_json TEXT DEFAULT NULL'); } catch (e) {}
// Reserved for the future "master chest" storage feature (not built yet —
// waiting on art). Column exists now so adding the chest later is a pure
// code change with no further schema migration needed. Unused/always NULL
// until that feature is implemented — don't read or write it before then.
try { db.exec('ALTER TABLE accounts ADD COLUMN master_chest_json TEXT DEFAULT NULL'); } catch (e) {}
// New currency system (2026-07-13) — total-bronze integer, see currency.js
// for the bronze/silver/gold denomination math. Replaces the old flat `gold`
// column above as the ONLY currency going forward (that column is left in
// place, untouched, purely so the one-time migration below has something to
// read — nothing writes to it anymore after this change).
try { db.exec('ALTER TABLE accounts ADD COLUMN currency_bronze INTEGER DEFAULT 0'); } catch (e) {}

// One-time migration: backfill cumulative_exp from existing level/exp
try {
  const rows = db.prepare('SELECT id, level, exp FROM accounts WHERE cumulative_exp = 0 AND (level > 1 OR exp > 0)').all();
  const { cumulativeExp } = require('./exp');
  for (const row of rows) {
    const c = cumulativeExp(row.level, row.exp);
    db.prepare('UPDATE accounts SET cumulative_exp = ? WHERE id = ?').run(c, row.id);
  }
} catch (e) {}

// One-time migration (2026-07-13): reinterpret each account's old flat
// `gold` value as its starting currency_bronze total, per Travis — a direct
// copy, not a conversion with a multiplier, so nobody's balance appears to
// change the moment this ships. Only touches rows that still have the
// untouched default (currency_bronze = 0) and actually had old gold to
// carry over, so re-running this on every boot is a safe no-op after the
// first time.
try {
  const rows = db.prepare('SELECT id, gold FROM accounts WHERE currency_bronze = 0 AND gold > 0').all();
  const stmt = db.prepare('UPDATE accounts SET currency_bronze = ? WHERE id = ?');
  for (const row of rows) stmt.run(row.gold, row.id);
} catch (e) {}

module.exports = db;
