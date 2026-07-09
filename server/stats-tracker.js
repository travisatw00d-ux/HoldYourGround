const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'data', 'game-stats.jsonl');

function recordGameStart(roomId, playerNames) {
  try {
    const entry = JSON.stringify({ t: Date.now(), event: 'gameStart', room: roomId, players: playerNames }) + '\n';
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) {}
}

function getStats24h() {
  const cutoff = Date.now() - 86400000;
  let games = 0;
  const players = new Set();
  try {
    const data = fs.readFileSync(LOG_PATH, 'utf8');
    for (const line of data.trim().split('\n').filter(Boolean)) {
      const e = JSON.parse(line);
      if (e.t >= cutoff && e.event === 'gameStart') {
        games++;
        (e.players || []).forEach(n => players.add(n));
      }
    }
  } catch (e) {}
  const sorted = Array.from(players).sort((a, b) => a.localeCompare(b));
  return { gamesPlayed24h: games, playersPlayed24h: players.size, playersPlayed24hList: sorted };
}

module.exports = { recordGameStart, getStats24h };
