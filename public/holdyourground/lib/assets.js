import { state } from './state.js';
import { loadSounds } from './audio.js';
import { MOB_TYPES } from './game-data.js';

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function preRenderMiniIcons() {
  const sheet = state.miniSheet;
  const frames = state.miniFrames;
  if (!sheet || !frames) return;
  state.miniIcons = {};
  const mobTypes = MOB_TYPES;
  for (const mt of mobTypes) {
    if (!mt.miniFrame) continue;
    const frame = frames[mt.miniFrame];
    if (!frame) continue;
    const f = frame.frame;
    const size = 48;
    const m = 2;
    const c = document.createElement('canvas');
    c.width = size * m;
    c.height = size * m;
    const cx = c.getContext('2d');
    const srcAspect = f.w / f.h;
    const dstAspect = c.width / c.height;
    let sx = 0, sy = 0, sw = c.width, sh = c.height;
    if (srcAspect > dstAspect) {
      sh = c.width / srcAspect;
      sy = (c.height - sh) / 2;
    } else {
      sw = c.height * srcAspect;
      sx = (c.width - sw) / 2;
    }
    cx.drawImage(sheet, f.x, f.y, f.w, f.h, sx, sy, sw, sh);
    state.miniIcons[mt.id] = c.toDataURL();
  }
}

async function loadGameAssets() {
  const _v = 'v=6';
  const json = (url) => fetch(url + '?' + _v).then(r => r.json()).catch(() => null);
  const [sheet, meta, kSheet, kMeta, hSheet, hMeta, layout, mSheet, mMeta, cSheet, cMeta, kwSheet, kwMeta, rSheet, rMeta, nSheet, nMeta, iSheet, iMeta] = await Promise.all([
    loadImage('/images/spritesheet.png?' + _v),
    json('/images/spritesheet.json'),
    loadImage('/images/KnightSheet.png?' + _v),
    json('/images/KnightSheet.json'),
    loadImage('/images/HUD.png?' + _v),
    json('/images/HUD.json'),
    json('/holdyourground/hud-layout.json'),
    loadImage('/images/Minis.png?' + _v),
    json('/images/Minis.json'),
    loadImage('/images/CardSheet.png?' + _v),
    json('/images/CardSheet.json'),
    loadImage('/images/KnightWeapons.png?' + _v),
    json('/images/KnightWeapons.json'),
    loadImage('/images/Ringsheet.png?' + _v),
    json('/images/Ringsheet.json'),
    loadImage('/images/Necklacesheet.png?' + _v),
    json('/images/Necklacesheet.json'),
    loadImage('/images/ItemSheet.png?' + _v),
    json('/images/ItemSheet.json')
  ]);
  state.spriteSheet = sheet;
  state.spriteFrames = meta.frames;
  state.knightSheet = kSheet;
  state.knightFrames = kMeta.frames;
  state.hudSheet = hSheet;
  state.hudFrames = hMeta.frames;
  state.hudLayout = layout;
  state.miniSheet = mSheet;
  state.miniFrames = mMeta.frames;
  state.cardSheet = cSheet;
  state.cardFrames = cMeta.frames;
  // Flat item icons (inventory/equipment slots) — separate from knightSheet, which
  // holds in-hand combat animation frames. See ITEM_ICONS in game-data.js for the
  // itemId -> frame name mapping.
  state.knightWeaponsSheet = kwSheet;
  state.knightWeaponsFrames = kwMeta.frames;
  state.ringSheet = rSheet;
  state.ringFrames = rMeta.frames;
  state.necklaceSheet = nSheet;
  state.necklaceFrames = nMeta.frames;
  // Misc world/currency item icons (goldcoin.png, T1HealthPotion.png, ...) —
  // 2026-07-13, added for the gold-coin drop mechanic. Same "flat icon
  // sheet" convention as ringSheet/necklaceSheet above, referenced directly
  // by frame name in render.js/ui.js (gold isn't a bag item, so it doesn't
  // go through ITEM_ICONS/game-data.js like equipment icons do).
  state.itemSheet = iSheet;
  state.itemFrames = iMeta.frames;

  const gearFrame = state.hudFrames?.['settingsgear.png']?.frame;
  if (gearFrame) {
    const c = document.createElement('canvas');
    c.width = gearFrame.w; c.height = gearFrame.h;
    const cx = c.getContext('2d');
    cx.drawImage(state.hudSheet, gearFrame.x, gearFrame.y, gearFrame.w, gearFrame.h, 0, 0, gearFrame.w, gearFrame.h);
    const img = document.getElementById('settingsGearImg');
    if (img) img.src = c.toDataURL();
  }
  preRenderMiniIcons();
}

let assetsLoaded = false;
let assetsPromise = null;

export function ensureAssets() {
  if (assetsLoaded) return Promise.resolve();
  if (!assetsPromise) {
    assetsPromise = loadGameAssets().then(() => { assetsLoaded = true; loadSounds(); }).catch(e => {
      assetsPromise = null;
      console.error('[HYG] asset load failed:', e);
      throw e;
    });
  }
  return assetsPromise;
}

export async function enterGame(socket) {
  try { await ensureAssets(); } catch (e) {
    document.getElementById('loadingOverlay').classList.add('hidden');
    socket.emit('leaveRoom');
    return;
  }
  if (!state.backgroundCanvas) {
    const { generateBackground } = await import('./render.js');
    state.backgroundCanvas = generateBackground(state.worldW, state.worldH);
    state.backgroundCanvasLight = generateBackground(state.worldW, state.worldH, '#e8e4d8');
  }
  state._joinedEnded = false;
  state.screen = 'playing';
  // currencyBronze deliberately NOT reset here — see the matching comment
  // in net-events.js's 'eliminated'/'joinedGame' handlers. Its correct
  // value is already set by onAuth() at login (before any room join) and
  // kept current via 'accountUpdate'; zeroing it on every enterGame() was
  // the root cause of currency appearing to reset on "Play Again".
  state.level = 1; state.exp = 0; state.expToNext = 100;
  state.zombies = []; state.activePlayerCount = 0;
  state.dmgNumbers = []; state.zombieAnims = {}; state.waveComposition = null;
  state.localAnim = null; state._mirrorSword = false; state.lbSig = ''; state.hotSig = '';
  const { resetWavePopup } = await import('./next-wave-popup.js');
  resetWavePopup();
  document.getElementById('eliminated').classList.add('hidden');
  document.getElementById('loadingOverlay').classList.add('hidden');
  const { updateJoinButton } = await import('./render-ui.js');
  updateJoinButton();
  if (!document.getElementById('resultsOverlay').classList.contains('hidden')) {
    document.getElementById('joinGameBtn').classList.add('hidden');
  }
  ['hud', 'settingsBtn'].forEach(id => document.getElementById(id).classList.remove('hidden'));
  const { startRender } = await import('./render.js');
  startRender(socket);
}
