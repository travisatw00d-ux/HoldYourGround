import { state } from './state.js';
import { MOB_TYPES } from './game-data.js';

let nwpTimer = null;

export function showNWPopup() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup || !tab) return;
  clearTimeout(nwpTimer);
  popup.classList.remove('out', 'expanded');
  tab.classList.add('hidden');
  document.getElementById('nwpOverlay').classList.remove('visible');
  void popup.offsetWidth;
  popup.classList.remove('hidden');
  popup.classList.add('in');
  document.getElementById('nwpTitle').textContent = state.matchPhase === 'nighttime' ? 'THIS WAVE' : 'NEXT WAVE';
}

state._showNWPopup = showNWPopup;

export function toggleNWPopup() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup) return;
  if (popup.classList.contains('in') || popup.classList.contains('expanded')) {
    collapseNWTab();
  } else if (tab && !tab.classList.contains('hidden')) {
    reopenNWFromTab();
  } else if (state.waveComposition && state.waveComposition.enemies) {
    populateNWRows(state.waveComposition.enemies);
    const sl = state.waveComposition.serverLevel || '\u2014';
    document.getElementById('nwpSL').textContent = sl;
    document.getElementById('dSL').textContent = sl;
    document.getElementById('nwpWave').textContent = state.waveComposition.wave;
    document.getElementById('dWave').textContent = state.waveComposition.wave;
    showNWPopup();
    if (state.matchPhase === 'nighttime') updateNWCounts();
  }
}

function collapseNWTab() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup || !tab) return;
  popup.classList.remove('in', 'expanded');
  popup.classList.add('out');
  document.getElementById('nwpOverlay').classList.remove('visible');
  setTimeout(() => {
    if (!popup.classList.contains('in') && !popup.classList.contains('expanded')) {
      popup.classList.add('hidden');
      tab.classList.remove('hidden');
    }
  }, 300);
}

function expandNWPopup() {
  const popup = document.getElementById('nextWavePopup');
  if (!popup) return;
  clearTimeout(nwpTimer);
  popup.classList.add('expanded');
  document.getElementById('nwpOverlay').classList.add('visible');
}

function reopenNWFromTab() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup || !tab) return;
  clearTimeout(nwpTimer);
  tab.classList.add('hidden');
  popup.classList.remove('hidden', 'out');
  void popup.offsetWidth;
  popup.classList.add('in');
  document.getElementById('nwpTitle').textContent = state.matchPhase === 'nighttime' ? 'THIS WAVE' : 'NEXT WAVE';
  if (state.matchPhase === 'nighttime') updateNWCounts();
}

export function resetWavePopup() {
  clearTimeout(nwpTimer);
  if (state._nwpHideTimer) { clearTimeout(state._nwpHideTimer); state._nwpHideTimer = null; }
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  const overlay = document.getElementById('nwpOverlay');
  if (popup) { popup.classList.remove('in', 'expanded', 'out'); popup.classList.add('hidden'); }
  if (tab) tab.classList.add('hidden');
  if (overlay) overlay.classList.remove('visible');
  state.waveComposition = null;
}

function hideNWPopup() {
  const popup = document.getElementById('nextWavePopup');
  const tab = document.getElementById('nextWaveTab');
  if (!popup || !tab) return;
  clearTimeout(nwpTimer);
  popup.classList.remove('in', 'expanded');
  popup.classList.add('hidden');
  tab.classList.add('hidden');
  document.getElementById('nwpOverlay').classList.remove('visible');
}

function populateNWRows(enemies) {
  const list = document.getElementById('nwpList');
  const grid = document.getElementById('nwpGrid');
  if (!list || !grid) return;

  const expanded = enemies.map(e => {
    const mt = MOB_TYPES[e.mobType];
    const name = mt ? mt.name : 'UNKNOWN';
    let iconHtml = mt && mt.emoji ? mt.emoji : '\u25CF';
    if (mt && mt.id && state.miniIcons && state.miniIcons[mt.id]) {
      iconHtml = '<img src="' + state.miniIcons[mt.id] + '" alt="' + mt.name + '">';
    }
    return { iconHtml, name, count: e.count };
  });
  expanded.sort((a, b) => b.count - a.count);

  const top3 = expanded.slice(0, 3);
  const rest = expanded.slice(3);

  let total = expanded.reduce((s, e) => s + e.count, 0);
  document.getElementById('nwpTotal').textContent = total;
  document.getElementById('dTotal').textContent = total;
  document.getElementById('dTypes').textContent = enemies.length;

  list.innerHTML = top3.map(e =>
    '<div class="nwp-row"><div class="icon">' + e.iconHtml + '</div><span class="name">' + e.name + '</span><span class="count">&times;' + e.count + '</span></div>'
  ).join('');
  document.getElementById('nwpMore').textContent = rest.length > 0 ? '+ ' + rest.length + ' other types' : '';

  grid.innerHTML = expanded.map(e =>
    '<div class="grid-cell"><div class="icon">' + e.iconHtml + '</div><span class="name">' + e.name + '</span><span class="count">&times;' + e.count + '</span></div>'
  ).join('');
}

function updateNWCounts() {
  const popup = document.getElementById('nextWavePopup');
  if (!popup || !popup.classList.contains('in') || state.matchPhase !== 'nighttime' || !state.waveComposition) return;
  const totalEverSpawned = state._totalZombieCount || 0;

  const aliveCounts = {};
  for (const z of state.zombies) { if (z.alive) aliveCounts[z.mobType] = (aliveCounts[z.mobType] || 0) + 1; }

  const list = document.getElementById('nwpList');
  const incomingList = document.getElementById('nwpIncomingList');
  const incomingSection = document.getElementById('nwpIncoming');
  if (!list || !incomingList || !incomingSection) return;

  const poolTotal = state.waveComposition.enemies.reduce((s, e) => s + e.count, 0);
  const serverRealAlive = state._serverAlive || 0;
  const totalDead = Math.max(0, totalEverSpawned - serverRealAlive);
  const grandRemaining = Math.max(0, poolTotal - totalDead);
  if (totalEverSpawned !== state._lastNWLog) {
    state._lastNWLog = totalEverSpawned;
  }
  document.getElementById('nwpTotal').textContent = grandRemaining;
  document.getElementById('dTotal').textContent = grandRemaining;

  const rows = state.waveComposition.enemies.map(e => {
    const mt = MOB_TYPES[e.mobType];
    const dead = poolTotal > 0 ? Math.min(e.count, Math.round(totalDead * (e.count / poolTotal))) : 0;
    const remaining = Math.max(0, e.count - dead);
    let iconHtml = mt && mt.emoji ? mt.emoji : '\u25CF';
    if (mt && mt.id && state.miniIcons && state.miniIcons[mt.id]) {
      iconHtml = '<img src="' + state.miniIcons[mt.id] + '" alt="' + mt.name + '">';
    }
    return { iconHtml, name: mt ? mt.name : 'UNKNOWN', remaining, target: e.count, mobType: e.mobType };
  });
  rows.sort((a, b) => b.remaining - a.remaining);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  list.innerHTML = top3.map(r =>
    '<div class="nwp-row"><div class="icon">' + r.iconHtml + '</div><span class="name">' + r.name + '</span><span class="count">&times;' + r.remaining + '</span></div>'
  ).join('');
  document.getElementById('nwpMore').textContent = rest.length > 0 ? '+ ' + rest.length + ' other types' : '';

  const incomingTotal = Math.max(0, poolTotal - totalEverSpawned);
  if (incomingTotal > 0 && poolTotal > 0) {
    incomingSection.style.display = '';
    incomingList.innerHTML = rows.map(r => {
      const inc = Math.max(0, Math.round(incomingTotal * (r.target / poolTotal)));
      return inc > 0 ? '<div class="nwp-inc-row"><div class="icon">' + r.iconHtml + '</div><span class="name">' + r.name + '</span><span class="count">&times;' + inc + '</span></div>' : '';
    }).join('');
  } else {
    incomingSection.style.display = 'none';
  }
}

if (!window._nwpBound) {
  window._nwpBound = true;
  document.addEventListener('click', function(e) {
    const popup = document.getElementById('nextWavePopup');
    const overlay = document.getElementById('nwpOverlay');
    const tab = document.getElementById('nextWaveTab');

    if (tab && !tab.classList.contains('hidden') && tab.contains(e.target)) {
      reopenNWFromTab();
      return;
    }
    if (popup && e.target.closest('#nwpClose')) {
      collapseNWTab();
      return;
    }
    if (popup && popup.classList.contains('in') && popup.contains(e.target) && !e.target.closest('.nwp-grid')) {
      expandNWPopup();
      return;
    }
    if (overlay && overlay.classList.contains('visible') && overlay.contains(e.target)) {
      collapseNWTab();
      return;
    }
  });
}

export { hideNWPopup, populateNWRows, updateNWCounts };
