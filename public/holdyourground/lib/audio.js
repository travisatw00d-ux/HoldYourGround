import { state } from './state.js';
import { MOB_TYPES } from './game-data.js';

let ctx = null;
let masterGain = null;
let sfxGain = null;
let ambGain = null;
const bufferCache = new Map();
const activeLoops = new Map();
let _loaded = false;

export function audioInit() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.connect(masterGain);
  ambGain = ctx.createGain();
  ambGain.connect(masterGain);

  const saved = parseFloat(localStorage.getItem('hyg_volume'));
  masterGain.gain.value = (saved >= 0 && saved <= 1) ? saved : 0.8;
}

export function getMasterVolume() {
  return masterGain ? masterGain.gain.value : 0.8;
}

export function setMasterVolume(v) {
  const vol = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = vol;
  localStorage.setItem('hyg_volume', vol);
}

const SFX_LIST = [
  'player_jab', 'player_hurt', 'player_death',
  'SwordSwing1', 'SwordSwing2', 'SwordSwing3',
  'wave_day', 'wave_night',
  'mob_zombie_attack', 'mob_zombie_hit', 'mob_zombie_kill',
  'mob_troll_attack', 'mob_troll_hit', 'mob_troll_kill',
  'mob_goblin_attack', 'mob_goblin_hit', 'mob_goblin_kill',
];

export async function loadSounds() {
  if (_loaded) return;
  if (!ctx) audioInit();
  const promises = SFX_LIST.map(async (name) => {
    try {
      const res = await fetch('/sfx/' + name + '.mp3');
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      bufferCache.set(name, decoded);
    } catch { /* file not found — skip */
    }
  });
  await Promise.allSettled(promises);
  _loaded = true;
}

export function playSound(name, options = {}) {
  if (!ctx || !masterGain) return;
  const buffer = bufferCache.get(name);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  if (options.loop) source.loop = true;

  const vol = options.volume ?? 1;
  let gainNode = sfxGain;

  if (options.x != null) {
    const me = state.players[state.myId];
    if (me) {
      const dx = options.x - me.x;
      const dy = options.y - me.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = options.maxDist || 500;
      const distVol = Math.max(0, 1 - dist / maxDist);
      if (distVol <= 0) return;
      const perSoundGain = ctx.createGain();
      perSoundGain.gain.value = vol * distVol;
      source.connect(perSoundGain);
      perSoundGain.connect(sfxGain);
    } else {
      return;
    }
  } else {
    const perSoundGain = ctx.createGain();
    perSoundGain.gain.value = vol;
    source.connect(perSoundGain);
    perSoundGain.connect(sfxGain);
  }

  source.start(0);

  if (options.loop) {
    activeLoops.set(name, { source, gainNode });
  }
}

export function playMobSound(mobType, action, options = {}) {
  const mobTypes = MOB_TYPES;
  const mt = mobTypes[mobType];
  if (!mt) return;
  const name = 'mob_' + mt.id + '_' + action;
  playSound(name, options);
}

export function stopAmbient(name) {
  const entry = activeLoops.get(name);
  if (entry) {
    try { entry.source.stop(); } catch {}
    activeLoops.delete(name);
  }
}

export function stopAll() {
  for (const [name] of activeLoops) stopAmbient(name);
}

export function audioClose() {
  stopAll();
  if (ctx) {
    ctx.close();
    ctx = null;
    masterGain = null;
    sfxGain = null;
    ambGain = null;
  }
  _loaded = false;
}
