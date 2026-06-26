# OpenCode Saved Conversations

Data lives at `C:\Users\travi\.local\share\opencode\` (SQLite: `opencode.db`, session diffs: `storage\session_diff\`).

## Browse / Resume

- **Session browser**: `Ctrl+A → S` or `Ctrl+X → L` or `/sessions`
- **New session**: `/new`
- **Export current as Markdown**: `/export`

## CLI

| Command | What it does |
|---|---|
| `opencode list` | Lists sessions in current project |
| `opencode list --all` | Lists all sessions across projects |
| `opencode export [session-id]` | Exports session as JSON |
| `opencode import <file>` | Imports session from JSON |

## Key Paths

| What | Path |
|---|---|
| SQLite DB | `C:\Users\travi\.local\share\opencode\opencode.db` |
| Session diffs | `C:\Users\travi\.local\share\opencode\storage\session_diff\` |
| Logs | `C:\Users\travi\.local\share\opencode\log\` |
| CLI | `C:\Users\travi\AppData\Roaming\npm\opencode.ps1` |

## Direct SQLite Query

```sql
SELECT id, title, directory, datetime(time_created/1000,'unixepoch') FROM session ORDER BY time_updated DESC;
```
