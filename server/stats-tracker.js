const fs = require('fs');
const path = require('path');

const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data');
const LOG_PATH = path.join(DATA_DIR, 'game-stats.jsonl');

function recordGameStart(roomId, playerNames) {
  try {
    const entry = JSON.stringify({ t: Date.now(), event: 'gameStart', room: roomId, players: playerNames }) + '\n';
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) {}
}

function recordVisit(name) {
  try {
    const entry = JSON.stringify({ t: Date.now(), event: 'visit', name: name || 'anon' }) + '\n';
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) {}
}

function getStats24h() {
  const cutoff = Date.now() - 86400000;
  let games = 0;
  const players = new Set();
  const visitors = new Set();
  try {
    const data = fs.readFileSync(LOG_PATH, 'utf8');
    for (const line of data.trim().split('\n').filter(Boolean)) {
      const e = JSON.parse(line);
      if (e.t < cutoff) continue;
      if (e.event === 'gameStart') {
        games++;
        (e.players || []).forEach(n => players.add(n));
      } else if (e.event === 'visit') {
        visitors.add(e.name || 'anon');
      }
    }
  } catch (e) {}
  const sortedVisitors = Array.from(visitors).sort((a, b) => a.localeCompare(b));
  const sortedPlayers = Array.from(players).sort((a, b) => a.localeCompare(b));
  return { gamesPlayed24h: games, playersPlayed24h: players.size, playersPlayed24hList: sortedPlayers, visitors24h: visitors.size, visitors24hList: sortedVisitors };
}

module.exports = { recordGameStart, recordVisit, getStats24h };
