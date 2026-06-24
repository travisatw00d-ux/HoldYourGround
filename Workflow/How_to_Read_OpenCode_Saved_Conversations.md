# How to Read OpenCode Saved Conversations (Travis's Machine)

Your OpenCode conversation data lives in two main locations on this computer:

- **SQLite database (primary):** `C:\Users\travi\.local\share\opencode\opencode.db`
- **Session diff files (JSON):** `C:\Users\travi\.local\share\opencode\storage\session_diff\`

---

## Method 1: Built-in Session Browser (Recommended)

While inside OpenCode, use any of these to browse/reopen past conversations:

| Action | Key / Command |
|---|---|
| Open session browser | <kbd>Ctrl+A</kbd> then <kbd>S</kbd> |
| Open session browser (alt) | <kbd>Ctrl+X</kbd> then <kbd>L</kbd> |
| Command | `/sessions` |
| New session | `/new` |
| Export current as Markdown | `/export` |

Use arrow keys to navigate, fuzzy-type to filter, and press <kbd>Enter</kbd> to resume a session.

---

## Method 2: CLI -- List, Export, Import

OpenCode has a built-in CLI (`opencode`) for session management.

| Command | What it does |
|---|---|
| **`opencode list`** | Lists all sessions in the current project |
| **`opencode list --all`** | Lists sessions across all projects |
| **`opencode export`** | Exports current session as JSON |
| **`opencode export <session-id>`** | Exports a specific session |
| **`opencode import <file>`** | Imports a session from a JSON backup |

**Exporting to Markdown for reading:** inside OpenCode's TUI, type `/export` and it saves the current conversation as a Markdown file.

---

## Method 3: Direct SQLite Queries

OpenCode stores everything in a SQLite database. You can query it directly:

```powershell
# Open the database
sqlite3 "$env:LOCALAPPDATA\..\.local\share\opencode\opencode.db"
```

### Useful queries inside sqlite3:

```sql
-- List all sessions (with title, directory, date)
SELECT id, title, directory, datetime(time_created / 1000, 'unixepoch') AS created,
       datetime(time_updated / 1000, 'unixepoch') AS updated
FROM session
ORDER BY time_updated DESC;

-- Count total sessions and messages
SELECT 'Sessions: ' || COUNT(*) FROM session
UNION ALL
SELECT 'Messages: ' || COUNT(*) FROM message;

-- View messages for a specific session (replace with your session ID)
SELECT m.id, m.time_created, p.data
FROM message m
JOIN part p ON p.message_id = m.id
WHERE m.session_id = 'ses_XXXXX'
ORDER BY m.time_created ASC;

-- Search all conversations for a keyword
SELECT DISTINCT s.id, s.title, s.directory
FROM session s
JOIN message m ON m.session_id = s.id
JOIN part p ON p.message_id = m.id
WHERE p.data LIKE '%your search term%'
ORDER BY s.time_updated DESC;

-- Get session with most messages
SELECT s.id, s.title, COUNT(m.id) AS msg_count
FROM session s
JOIN message m ON m.session_id = s.id
GROUP BY s.id
ORDER BY msg_count DESC
LIMIT 10;
```

### Readable conversation export from sqlite3:

Run this in PowerShell to dump a session as readable text:

```powershell
sqlite3 "$env:LOCALAPPDATA\..\.local\share\opencode\opencode.db" @"
.mode column
.headers on
SELECT datetime(p.time_created / 1000, 'unixepoch') AS timestamp,
       CASE WHEN json_extract(p.data, '$.type') = 'text' THEN json_extract(p.data, '$.text')
            WHEN json_extract(p.data, '$.type') = 'tool_use' THEN '[Tool: ' || json_extract(p.data, '$.name') || ']'
            ELSE json_extract(p.data, '$.type')
       END AS content
FROM part p
WHERE p.session_id = 'ses_XXXXX'
ORDER BY p.time_created ASC;
"@
```

(Replace `ses_XXXXX` with the actual session ID from the list query.)

---

## Method 4: Read Session Diff Files (JSON)

Session diffs are stored as JSON files in:

```
C:\Users\travi\.local\share\opencode\storage\session_diff\
```

List them:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\..\.local\share\opencode\storage\session_diff\" -Name
```

Read one:

```powershell
Get-Content "$env:LOCALAPPDATA\..\.local\share\opencode\storage\session_diff\ses_XXXXX.json" | ConvertFrom-Json
```

Or pipe to `jq` if you have it installed:

```powershell
Get-Content "$env:LOCALAPPDATA\..\.local\share\opencode\storage\session_diff\ses_XXXXX.json" | jq .
```

---

## Method 5: opencode-replay (Third-Party Tool)

[opencode-replay](https://github.com/ramtinj95/opencode-replay) generates static HTML pages from your sessions -- like a readable transcript in your browser.

**You don't have this installed yet.** To install:

```powershell
npm install -g opencode-replay
```

Then run:

```powershell
# Generate HTML for the current project's sessions
opencode-replay

# Generate for all projects
opencode-replay --all

# Open in browser after generation
opencode-replay --open
```

It reads directly from `~/.local/share/opencode/storage/session_diff/` and creates HTML files with styled tool calls, diffs, and search.

---

## Quick Reference: Key File Paths

| What | Path on this machine |
|---|---|
| SQLite database | `C:\Users\travi\.local\share\opencode\opencode.db` |
| Session diff files | `C:\Users\travi\.local\share\opencode\storage\session_diff\` |
| Logs | `C:\Users\travi\.local\share\opencode\log\` |
| Tool output cache | `C:\Users\travi\.local\share\opencode\tool-output\` |
| Desktop app config | `C:\Users\travi\AppData\Roaming\ai.opencode.desktop\` |
| CLI executable | `C:\Users\travi\AppData\Roaming\npm\opencode.ps1` |
| Shortcut (PowerShell) | `opencode` (available in PATH) |
