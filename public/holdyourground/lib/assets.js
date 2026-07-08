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
  const [sheet, meta, kSheet, kMeta, hSheet, hMeta, layout, mSheet, mMeta, cSheet, cMeta] = await Promise.all([
    loadImage('/images/spritesheet.png'),
    fetch('/images/spritesheet.json').then(r => r.json()),
    loadImage('/images/KnightSheet.png'),
    fetch('/images/KnightSheet.json').then(r => r.json()),
    loadImage('/images/HUD.png'),
    fetch('/images/HUD.json').then(r => r.json()),
    fetch('/holdyourground/hud-layout.json').then(r => r.json()).catch(() => null),
    loadImage('/images/Minis.png'),
    fetch('/images/Minis.json').then(r => r.json()),
    loadImage('/images/CardSheet.png'),
    fetch('/images/CardSheet.json').then(r => r.json())
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
  state.level = 1; state.exp = 0; state.expToNext = 100; state.gold = 0;
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
