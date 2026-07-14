const path = require('path');
const fs = require('fs');
const {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H, VIEW_MARGIN,
  MAX_PLAYERS, ROOM_EMPTY_TIMEOUT_MS,
  TICK_MS, BROADCAST_MS
} = require('./config');
const SpatialGrid = require('./spatial-grid');
const playerMod = require('./player');
const { initEnemies, buildSpawnPool } = require('./zombie');
const zombieAi = require('./zombie-ai');
const physics = require('./physics');
const bp = require('./binary-protocol');
const expMod = require('./exp');
const db = require('./db');
const phaseManager = require('./phase-manager');
const joinManager = require('./join-manager');
const combatSystem = require('./combat-system');
const specManager = require('./spectator-manager');
const itemDrops = require('./item-drops');
const currencyMod = require('./currency');

const DIAG_LOG = path.join(__dirname, '..', 'Workflow', 'diag-log.json');

class Room {
  constructor(id) {
    this.id = id;
    this.io = null;
    this.players = {};
    this.mobSpawnPool = buildSpawnPool(1);
    this.zombies = initEnemies(this.mobSpawnPool, 1, this.players);
    this.grid = new SpatialGrid(120, WORLD_W, WORLD_H);
    this.lastBroadcast = 0;
    this.lastEmitTime = 0;
    this.currentServerLevel = 0;
    this.waveServerLevel = 1;
    this._playerList = [];
    this._viewZ = [];
    this._emptyTimeout = null;
    this._roundSaved = false;
    this._persistedExp = new Map();
    // Delta-save tracking for the currency system, same pattern as
    // _persistedExp above — but UNLIKE exp, p.currencyBronze never resets
    // to 0 at match restart (see addPlayer()/join-manager.js: currency
    // carries forward across matches within a session, same as equipment).
    // Seeded to the account's loaded starting balance in addPlayer() below
    // so the very first _saveRound() computes a 0 delta for a player who
    // hasn't picked anything up yet, instead of re-adding their entire
    // starting balance on top of itself.
    this._persistedCurrency = new Map();
    this.matchPhase = 'waiting';
    this.phaseTimer = 0;
    this.currentWave = 0;
    this.matchStarted = false;
    this._lobbyOrder = [];
    this._endGameReady = new Set();
    this._lastEndGameBroadcast = 0;
    this._joinQueue = [];
    this._postGameWaiting = false;
    this.spectatorFollows = new Map();
    this.tickNum = 0;
    this._nightMaxPop = 0;
    this.itemDrops = {};
    this._nextDropId = 1;
  }

  setIo(io) { this.io = io; }
  getPlayerCount() { return Object.keys(this.players).length; }
  isEmpty() { return this.getPlayerCount() === 0; }

  getLobbyPlayers() {
    return this._lobbyOrder.map(id => {
      const p = this.players[id];
      if (!p) return null;
      return { id, name: p.name, accountType: p.accountType || 'guest', level: p.lvl || 1, exp: p.exp || 0, playerBuild: p.playerBuild || 'standard' };
    }).filter(Boolean);
  }

  getActivePlayerIds() { return joinManager.getActivePlayerIds(this); }
  getActivePlayerCount() { return joinManager.getActivePlayerCount(this); }

  _broadcastLobbyUpdate() {
    this.io.to('room:' + this.id).emit('lobbyUpdate', { players: this.getFilteredLobbyPlayers() });
  }

  getFilteredLobbyPlayers() {
    const all = this.getLobbyPlayers();
    if (this.matchPhase === 'ended') {
      return all.filter(p => this._endGameReady.has(p.id));
    }
    if (this.matchPhase === 'waiting' && this._postGameWaiting) {
      return all.filter(p => !this.players[p.id]?.isSpectator);
    }
    if (this._endGameReady.size > 0 && this.matchPhase !== 'waiting') {
      return all.filter(p => this._endGameReady.has(p.id) || !this.players[p.id]?.isSpectator);
    }
    return all;
  }

  _diag(id, action, extra = {}) {
    const p = this.players[id];
    if (!p || !p.name || !p.name.toLowerCase().includes('diag')) return;
    try {
      const entry = JSON.stringify({
        t: Date.now(), name: p.name, id,
        action, matchPhase: this.matchPhase, phaseTimer: this.phaseTimer,
        alive: p.alive, isSpectator: p.isSpectator,
        inQueue: this._joinQueue.includes(id),
        queuePos: this._joinQueue.indexOf(id),
        activeCount: this.getActivePlayerCount(),
        ...extra
      }) + '\n';
      fs.appendFileSync(DIAG_LOG, entry);
    } catch (e) {}
  }

  addPlayer(id, name, accountType, accountId) {
    playerMod.addPlayer(id, name, this.players, this.zombies, accountType, accountId);
    // See the _persistedCurrency comment in the constructor — must be seeded
    // here, synchronously, before this player's first _saveRound() ever runs.
    this._persistedCurrency.set(id, (this.players[id] && this.players[id].currencyBronze) || 0);
    const isActive = this.matchPhase !== 'waiting' && this.matchPhase !== 'ended';
    if (isActive || this.matchPhase === 'ended') {
      const p = this.players[id];
      p.isSpectator = true;
      p.alive = false;
    }
    if (this.matchPhase === 'waiting') {
      let activeCount = 0;
      for (const pid in this.players) {
        if (!this.players[pid].isSpectator) activeCount++;
      }
      if (activeCount > MAX_PLAYERS) {
        const p = this.players[id];
        p.isSpectator = true;
        p.alive = false;
      }
    }
    this._diag(id, 'addPlayer', { isActive, accountType });
    this._broadcastQueueUpdate();
    this._broadcastLobbyUpdate();
    zombieAi.recalcAllZombieTargets(this.zombies, this.players);
    if (!this._lobbyOrder.includes(id)) this._lobbyOrder.push(id);
    if (this._emptyTimeout) { clearTimeout(this._emptyTimeout); this._emptyTimeout = null; }
    if (this.players[id].isSpectator) this._assignFollowTarget(id);
    return true;
  }

  // Persists p's 5 equip slots (weapon/armor/ring/necklace/helmet) to their
  // account row so they survive across matches — see db.js's equipment_json
  // column comment and player.js's loadSavedEquipment() for the read side.
  // Deliberately does NOT touch p.inventorySlots (the 16-slot bag) — per
  // design, only equip-slot items persist; everything in the bag is lost
  // when a player leaves, same as before this feature existed. No-ops for
  // guests (p.accountId is null for them) and swallows any DB error rather
  // than throwing, so a save failure can never block the rest of
  // removePlayer's cleanup (queue promotion, lobby broadcast, etc.).
  _saveEquipment(p) {
    if (!p || !p.accountId) return;
    try {
      const equipmentToSave = {
        weapon: p.currentItem || null,
        armor: (p.equipment && p.equipment.armor) || null,
        ring: (p.equipment && p.equipment.ring) || null,
        necklace: (p.equipment && p.equipment.necklace) || null,
        helmet: (p.equipment && p.equipment.helmet) || null
      };
      db.prepare('UPDATE accounts SET equipment_json = ? WHERE id = ?').run(JSON.stringify(equipmentToSave), p.accountId);
    } catch (e) {
      // Deliberately still swallowed (a save failure must never block the
      // rest of removePlayer's cleanup — see comment above), but logged
      // now (2026-07-12) instead of silently vanishing: an empty catch here
      // means a real DB failure would lose a player's equipment with
      // zero trace anywhere. Check server logs for this line if someone
      // reports gear missing after a session.
      console.error(`[equipment] save failed for account ${p.accountId}:`, e);
    }
  }

  removePlayer(id) {
    const p = this.players[id];
    if (!p) return;
    this._saveEquipment(p);
    const wasActive = !p.isSpectator;
    this._diag(id, 'removePlayer', { wasActive, willPromote: wasActive });
    delete this.players[id];
    this._lobbyOrder = this._lobbyOrder.filter(oid => oid !== id);
    this._joinQueue = this._joinQueue.filter(qid => qid !== id);
    this.spectatorFollows.delete(id);
    this._broadcastQueueUpdate();
    if (wasActive && this.matchPhase !== 'ended') this._promoteFromQueue();
    this._broadcastLobbyUpdate();
    if (this.isEmpty()) {
      this._postGameWaiting = false;
      if (this.matchPhase === 'ended') {
        this._timerEndReset();
      } else if (!this._emptyTimeout) {
        this._emptyTimeout = setTimeout(() => {
          if (this.isEmpty()) {
            this.zombies.length = 0;
            this.grid.clear();
          }
        }, ROOM_EMPTY_TIMEOUT_MS);
      }
    }
  }

  handleInput(id, data) {
    const p = this.players[id];
    if (!p || p.isSpectator) return;
    p.input = { dx: data.dx, dy: data.dy };
    if (typeof data.angle === 'number') {
      p._lastMouseAngle = data.angle;
      if (!p.attacking) {
        if (p._lastTurnTime != null) {
          const dt = (Date.now() - p._lastTurnTime) / 1000;
          const maxDelta = (p.turnSpeed || 18) * Math.min(dt, 0.1);
          let diff = data.angle - p._lastSendAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) > maxDelta) {
            p.facingAngle = p._lastSendAngle + (diff > 0 ? maxDelta : -maxDelta);
          } else {
            p.facingAngle = data.angle;
          }
        } else {
          p.facingAngle = data.angle;
        }
        p._lastSendAngle = p.facingAngle;
        p._lastTurnTime = Date.now();
      }
    }
    if (typeof data.sprint === 'boolean') {
      if (data.sprint && !p.sprint) p._sprintDepleted = false;
      if (p.sprint && !data.sprint && !p._sprintDepleted) p.sprintEndCooldown = Date.now();
      p.sprint = data.sprint;
    }
  }

  handleAttack(id, facingAngle) { combatSystem.handleAttack(this, id, facingAngle); }
  _executeAttack(id, step, pendingAngle) { combatSystem._executeAttack(this, id, step, pendingAngle); }
  handleEquip(id, slot) { combatSystem.handleEquip(this, id, slot); }

  // Drag-and-drop between bag/equipment slots (see moveItem in player.js for
  // the location format + type/class validation rules). No-ops silently on an
  // invalid move (occupied destination, wrong item type, wrong class) — the
  // client never got an optimistic update, so nothing needs to roll back.
  handleMoveItem(id, from, to) {
    const p = this.players[id];
    if (!p || !p.alive) return;
    // Swapping the WEAPON slot specifically (not armor/ring/necklace/helmet —
    // those don't affect combat animation) mid-combo has the same corrupting
    // effect as toggling attack style mid-swing does (see isMidCombo's
    // comment in combat-system.js) — currentItem feeds isUnarmed/comboKey
    // live, recomputed every tick. No-ops silently, same convention as every
    // other rejected move (occupied destination, wrong type/class).
    if (combatSystem.isMidCombo(p) && ((from.kind === 'equip' && from.slot === 'weapon') || (to.kind === 'equip' && to.slot === 'weapon'))) return;
    const moved = playerMod.moveItem(p, from, to);
    if (moved) {
      playerMod.recalcStats(p);
      this.io.to('room:' + this.id).emit('playerInfo', playerMod.playerInfoObj(p));
    }
  }

  // Discarding an item from the bag or an equip slot — drops it on the
  // ground at the player's current position, exactly like a zombie-killed
  // drop (same _spawnItemDrop() call, same itemDropAdded broadcast, pickable
  // up by anyone). No-ops silently if the location is already empty (covers
  // both "nothing was ever there" and, critically, a duplicate/double-fired
  // client event — setItemAtLocation below clears the slot synchronously
  // before this returns, so a second call for the same location finds
  // nothing and can't spawn a second copy of the same item). See
  // getItemAtLocation/setItemAtLocation in player.js for the location shape.
  handleDropItem(id, loc) {
    const p = this.players[id];
    if (!p || !p.alive) return;
    // Same reasoning as handleMoveItem's weapon-slot guard above — discarding
    // the currently-equipped weapon mid-combo would flip isUnarmed live and
    // corrupt the in-progress attack, same as toggling attack style would.
    if (combatSystem.isMidCombo(p) && loc.kind === 'equip' && loc.slot === 'weapon') return;
    const item = playerMod.getItemAtLocation(p, loc);
    if (!item) return;
    playerMod.setItemAtLocation(p, loc, null);
    playerMod.recalcStats(p);
    this._spawnItemDrop(item, p.x, p.y, true);
    // Broadcast room-wide, not just to `id` — dropping an equipped weapon/
    // armor/etc changes what other players see rendered on this player
    // (e.g. currentItem going null flips the knight to unarmed), same
    // reasoning as handleMoveItem's broadcast above.
    this.io.to('room:' + this.id).emit('playerInfo', playerMod.playerInfoObj(p));
  }

  // World item drops. `item` is either a full rolled instance from
  // item-generator.js (instanceId/baseItemId/itemTier/rarityId/attributes)
  // or a {kind:'gold', amount} coin — the client renders whatever's in it,
  // it never generates or rerolls one itself. Broadcast room-wide since any
  // player can see and click-pick-up any drop, not just the one who landed
  // the kill/discard.
  //
  // `randomize` controls whether a small random offset (angle + distance) is
  // applied around (x, y) — see below. Call sites:
  //   - emitEvents()'s 'zombieKilled' case (equipment roll + gold-coin roll,
  //     independent of each other) calls this WITHOUT randomize for the
  //     FIRST drop a given kill produces — it should land exactly on the mob
  //     that died, full stop. This was accidentally randomized too between
  //     2026-07-11 and 2026-07-13 — Travis flagged it as a regression: "make
  //     the drops be positioned back where the mob is that's killed, make
  //     that normal again." But a single kill can produce a SECOND drop (a
  //     zombie can drop both an item and gold) — that one DOES pass
  //     randomize:true (via the `killDropCount > 0` check at the call site),
  //     same "don't stack directly on top of the previous drop" reasoning as
  //     the discard case below, just triggered by one kill instead of
  //     several player discards (2026-07-13).
  //   - handleDropItem() (drag-off-inventory / 'x' hotkey discard) always
  //     calls this WITH randomize:true — a standing player discarding
  //     several items in a row drops them all at the exact same point, and
  //     with zero spread each new drop hides the previous one directly
  //     underneath it (hitTestItemDrop() in input.js is a tight, non-
  //     overlapping rectangle test that only returns the closest drop to the
  //     cursor — a dead-stacked pile becomes permanently unclickable except
  //     for whichever landed last).
  _spawnItemDrop(item, x, y, randomize = false) {
    const id = 'drop' + (this._nextDropId++);
    let dropX = x, dropY = y;
    if (randomize) {
      // 20-60 world units comfortably exceeds ITEM_DROP_ICON_H (28) so
      // icons usually don't overlap, while staying visually "at" the spot
      // they were discarded from and well within ITEM_PICKUP_RANGE (200) of
      // the player who dropped them. Clamped to the world bounds so a
      // jitter near the edge of the map can't push a drop out of bounds.
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      dropX = Math.max(0, Math.min(WORLD_W, x + Math.cos(angle) * dist));
      dropY = Math.max(0, Math.min(WORLD_H, y + Math.sin(angle) * dist));
    }
    const drop = { id, item, x: dropX, y: dropY };
    this.itemDrops[id] = drop;
    this.io.to('room:' + this.id).emit('itemDropAdded', drop);
  }

  getItemDropsList() {
    return Object.values(this.itemDrops);
  }

  // Full wipe of world item drops — called from phase-manager.js's
  // 'daytime'->'nighttime' transition (the moment the next wave starts), so
  // drops survive the nighttime they spawned in plus the following
  // intermission and daytime, but never carry over past the next wave. No
  // per-drop removal events — a single broadcast is simpler for clients to
  // apply than replaying N individual itemDropRemoved events.
  clearItemDrops() {
    if (Object.keys(this.itemDrops).length === 0) return;
    this.itemDrops = {};
    this.io.to('room:' + this.id).emit('itemDropsCleared');
  }

  handlePickupItem(id, dropId) {
    const p = this.players[id];
    const drop = this.itemDrops[dropId];
    if (!p || !p.alive || p.isSpectator || !drop) return;
    const dx = p.x - drop.x, dy = p.y - drop.y;
    if (dx * dx + dy * dy > itemDrops.PICKUP_RANGE * itemDrops.PICKUP_RANGE) return;
    // Gold coins (2026-07-13) never touch the bag — they credit the wallet
    // directly and are always pickupable (no "bag full" rejection like
    // equipment drops below, since there's no slot to fill). Broadcasts
    // accountUpdate so the HUD/inventory currency readout updates the
    // instant it's picked up, same channel _awardExp() uses for exp/level.
    if (drop.item && drop.item.kind === 'gold') {
      p.currencyBronze = (p.currencyBronze || 0) + (drop.item.amount || 0);
      delete this.itemDrops[dropId];
      this.io.to('room:' + this.id).emit('itemDropRemoved', { id: dropId });
      const expResult = expMod.fromCumulativeExp(p.exp);
      this.io.to(id).emit('accountUpdate', { exp: expResult.exp, level: expResult.level, expToNext: expMod.getExpToNext(expResult.level), currencyBronze: p.currencyBronze, statPoints: p.statPoints || 0 });
      return;
    }
    const idx = playerMod.addToInventory(p, drop.item);
    if (idx === -1) return; // bag full — leave the drop where it is
    delete this.itemDrops[dropId];
    this.io.to('room:' + this.id).emit('itemDropRemoved', { id: dropId });
    this.io.to(id).emit('playerInfo', playerMod.playerInfoObj(p));
  }

  respawnPlayer(id) {
    playerMod.respawnPlayer(id, this.players, this.zombies);
    this._roundSaved = false;
    this.io.to(id).emit('respawned');
  }

  startMatch(fromEnded) { phaseManager.startMatch(this, fromEnded); }
  handleStartMatch(id) { phaseManager.handleStartMatch(this, id); }
  _advancePhase() { phaseManager._advancePhase(this); }
  _endMatch() { phaseManager._endMatch(this); }
  resetMatch() { phaseManager.resetMatch(this); }
  _timerEndReset() { phaseManager._timerEndReset(this); }
  _testAdvancePhase() { phaseManager._testAdvancePhase(this); }
  _computeServerLevel() { return phaseManager._computeServerLevel(this); }

  getPlayerInfoObj(id) {
    const p = this.players[id];
    return p ? playerMod.playerInfoObj(p) : null;
  }

  setFullscreen(id, enabled) { const p = this.players[id]; if (p) p.fullscreen = !!enabled; }
  setCameraZoom(id, opts) { playerMod.setCameraZoom(id, this.players, opts); }

  toggleGodMode(id) {
    const p = this.players[id];
    if (p) p.godMode = !p.godMode;
    return p ? p.godMode : false;
  }

  killAllMobs() {
    for (const z of this.zombies) z.alive = false;
  }

  _assignFollowTarget(spectatorId) { specManager._assignFollowTarget(this, spectatorId); }

  emitEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'hitConfirm': this.io.to(e.to).emit('hitConfirm', { targetId: e.targetId, dmg: e.dmg, x: e.x, y: e.y }); break;
        case 'gotHit': this.io.to(e.to).emit('gotHit', { attackerId: e.attackerId, dmg: e.dmg, health: e.health }); break;
        case 'eliminated': this.io.to(e.to).emit('eliminated', { kills: e.kills }); break;
        case 'zombieKilled': {
          this._awardExp(e.playerId, e.zombieLvl);
          this.io.to(e.playerId).emit('mobKilled', { mobType: e.mobType, x: e.x, y: e.y });
          // Luck shifts the rarity roll toward higher tiers (see
          // item-generator.js's getLuckAdjustedRarities()) — read from the
          // killer's CURRENT equipped stat total at the moment of the kill,
          // not cached/snapshotted anywhere.
          const killerLuck = (this.players[e.playerId] && this.players[e.playerId].luck) || 0;
          // A single kill can produce more than one drop (equipment roll
          // below AND a gold-coin roll, see below) — the first one still
          // lands exactly on the mob (per Travis's fix above), but any
          // drop AFTER the first from this same kill needs the random
          // offset so it doesn't land pixel-stacked directly on top of the
          // one that just spawned there (2026-07-13 — same unclickable-pile
          // problem discarding used to have, just now reachable from a
          // single kill instead of only from repeated player discards).
          let killDropCount = 0;
          const droppedInstance = itemDrops.rollDropInstance(Math.random, killerLuck);
          if (droppedInstance) { this._spawnItemDrop(droppedInstance, e.x, e.y, killDropCount > 0); killDropCount++; }
          // Gold-coin drop (2026-07-13) — a fully INDEPENDENT roll from the
          // equipment-instance roll just above (a zombie can drop neither,
          // either, or both; luck does not affect this roll, per Travis's
          // "just a thirty percent chance"). See currency.js for the
          // chance/amount constants. drop.item's {kind:'gold', amount} shape
          // is what tells the client (render.js/ui.js/input.js) and
          // handlePickupItem() below to treat this drop completely
          // differently from an equipment-instance drop — small coin icon
          // instead of the generic loot bag, credited straight to the
          // player's wallet on pickup instead of landing in a bag slot.
          const goldAmount = currencyMod.rollGoldDropAmount(Math.random);
          if (goldAmount) { this._spawnItemDrop({ kind: 'gold', amount: goldAmount }, e.x, e.y, killDropCount > 0); killDropCount++; }
          break;
        }
        case 'zombieAttackStart': this.io.to(e.to).emit('zombieAttackStart', { zombieId: e.zombieId, mobType: e.mobType }); break;
      }
    }
  }

  _awardExp(playerId, zombieLvl) {
    const p = this.players[playerId];
    if (!p || !p.alive || p.isSpectator) return;
    const prevLvl = p.lvl;
    p.exp += expMod.getExpForKill(zombieLvl);
    const result = expMod.fromCumulativeExp(p.exp);
    p.lvl = result.level;
    const levelGain = Math.max(0, p.lvl - prevLvl);
    if (levelGain > 0) p.statPoints = (p.statPoints || 0) + levelGain;
    this.io.to(playerId).emit('accountUpdate', { exp: result.exp, level: p.lvl, expToNext: expMod.getExpToNext(p.lvl), currencyBronze: p.currencyBronze || 0, statPoints: p.statPoints || 0 });
  }

  _saveRound() {
    const updateExpStmt = db.prepare('UPDATE accounts SET cumulative_exp = cumulative_exp + ? WHERE id = ?');
    // Currency delta-save mirrors exp's pattern below, but note the source
    // value never resets to 0 at match restart (see the _persistedCurrency
    // comment in the constructor) — this only ever saves genuinely NEW
    // currency picked up since the last save, same additive-on-the-DB-side
    // approach as cumulative_exp.
    const updateCurrencyStmt = db.prepare('UPDATE accounts SET currency_bronze = currency_bronze + ? WHERE id = ?');
    for (const id in this.players) {
      const p = this.players[id];
      if (p.isSpectator || !p.accountId) continue;
      if (Number.isFinite(p.exp) && p.exp > 0) {
        const alreadyPersistedExp = this._persistedExp.get(p.id) || 0;
        const expGain = p.exp - alreadyPersistedExp;
        if (Number.isFinite(expGain) && expGain > 0) {
          updateExpStmt.run(expGain, p.accountId);
          this._persistedExp.set(p.id, p.exp);
        }
      }
      if (Number.isFinite(p.currencyBronze) && p.currencyBronze > 0) {
        const alreadyPersistedCurrency = this._persistedCurrency.get(p.id) || 0;
        const currencyGain = p.currencyBronze - alreadyPersistedCurrency;
        if (Number.isFinite(currencyGain) && currencyGain > 0) {
          updateCurrencyStmt.run(currencyGain, p.accountId);
          this._persistedCurrency.set(p.id, p.currencyBronze);
        }
      }
    }
  }

  _allPlayersReady() {
    return this._endGameReady.size === Object.keys(this.players).length && Object.keys(this.players).length > 0;
  }

  _getSortedPlayerStats() {
    return Object.values(this.players).filter(p => !p.isSpectator).map(p => ({ name: p.name, level: p.lvl || 1, kills: p.kills || 0 })).sort((a, b) => b.level - a.level);
  }

  handleEndGameReady(id) { joinManager.handleEndGameReady(this, id); }
  handleEndGameLeave(id) { joinManager.handleEndGameLeave(this, id); }

  _broadcastEndGameUpdate() {
    const players = this.getLobbyPlayers();
    const ready = Array.from(this._endGameReady);
    const allReady = this._allPlayersReady();
    this.io.to('room:' + this.id).emit('endGameLobby', { players, ready, timer: Math.ceil(this.phaseTimer), allReady });
  }

  handleDirectJoin(id) { joinManager.handleDirectJoin(this, id); }
  handleQueueJoin(id) { joinManager.handleQueueJoin(this, id); }

  _broadcastQueueUpdate(directTargetId) {
    joinManager._broadcastQueueUpdate(this, directTargetId);
  }

  _promoteFromQueue() { joinManager._promoteFromQueue(this); }

  gameTick() {
    this.tickNum++;
    const tickStart = Date.now();

    if (this.matchPhase !== 'waiting' && this.phaseTimer > 0) {
      this.phaseTimer -= TICK_MS;
      if (this.phaseTimer <= 0) {
        this.phaseTimer = 0;
        console.log('[PHASE] timer expired phase=' + this.matchPhase);
        if (this.matchPhase === 'ended') { this._timerEndReset(); return; }
        this._advancePhase();
      }
    }

    if (this.matchPhase === 'ended') {
      if (this._endGameReady.size === 0 && this._joinQueue.length > 0 && this._joinQueue.length === Object.keys(this.players).length) {
        this._timerEndReset();
        return;
      }
      if (tickStart - this._lastEndGameBroadcast < BROADCAST_MS) return;
      this._lastEndGameBroadcast = tickStart;
      this._broadcastEndGameUpdate();
      return;
    }

    if (this.matchPhase !== 'waiting' && tickStart % (BROADCAST_MS * 3) < TICK_MS) {
      for (const id in this.players) {
        const sock = this.io?.sockets?.sockets?.get(id);
        if (sock && sock._lastDiagPing && tickStart - sock._lastDiagPing > 30000) {
          console.log(`[room ${this.id}] diag STALL ${id.slice(0,12)} no ping ${tickStart - sock._lastDiagPing}ms`);
        }
      }
    }

    const ids = Object.keys(this.players);
    if (ids.length === 0) return;

    for (const id of ids) {
      const p = this.players[id];
      if (!p.alive || p.isSpectator) continue;
      physics.processPlayerMovement(p);
      // Health Regen (2026-07-12) — HP/second from equipped healthRegenFlat/
      // healthRegenScaling attributes (0 by default, see player.js's
      // recalcStats()). Always-on every tick regardless of day/night phase
      // (simplest-first — not gated to out-of-combat) and capped at
      // maxHealth. See item-generation-system.md.
      if (p.healthRegen > 0 && p.health < p.maxHealth) {
        p.health = Math.min(p.maxHealth, p.health + p.healthRegen * (TICK_MS / 1000));
      }
    }

    this.grid.clear();
    for (const z of this.zombies) { if (z.alive) this.grid.insertZombie(z); }
    for (const id in this.players) { const p = this.players[id]; if (p.alive) this.grid.insertPlayer(p); }

    if (this.matchPhase === 'nighttime') {
      zombieAi.tickTargeting(this.zombies, this.players);
      zombieAi.moveAll(this.zombies, this.players);
      zombieAi.processZombieSeparation(this.zombies, this.grid);
      zombieAi.processWallCohesion(this.zombies, this.grid);
      this.grid.clearZombies();
      for (const z of this.zombies) { if (z.alive) this.grid.insertZombie(z); }
      const attackEvents = zombieAi.processZombieAttacks(this.zombies, this.players, this.grid, this.id);
      this.emitEvents(attackEvents);
      physics.processPlayerCollision(this.players);
      if (!Object.values(this.players).some(p => p.alive)) { this._endMatch(); return; }
      if (this.matchPhase === 'nighttime') {
        const fullPop = this.mobSpawnPool.length;
        if (this.tickNum % 30 === 0 && this._nightMaxPop < fullPop) {
          this._nightMaxPop += 1 + Math.floor(Math.random() * 2);
        }
        zombieAi.ensureCount(this.zombies, this.mobSpawnPool, this.waveServerLevel, this.players, Math.min(this._nightMaxPop, fullPop), true);
        if (this.tickNum % 20 === 0) {
          zombieAi.spawnKiterResponse(this.zombies, this.mobSpawnPool, this.waveServerLevel, this.players, fullPop);
        }
      }
    }

    combatSystem.processCombatTick(this);

    if (this.matchPhase === 'nighttime' && this.zombies.length > 0 && this.zombies.every(z => !z.alive)) this._advancePhase();

    if (tickStart - this.lastBroadcast < BROADCAST_MS) {
      if (tickStart % (BROADCAST_MS * 20) < TICK_MS) {
        for (const id in this.players) {
          const p = this.players[id];
          if (p && p._lastStateSent && tickStart - p._lastStateSent > 5000) {
            console.log(`[room ${this.id}] SKIP bcast spec=${id.slice(0,8)} lastState=${tickStart - p._lastStateSent}ms alive=${p.alive} spec=${p.isSpectator}`);
            break;
          }
        }
      }
      return;
    }
    this.lastBroadcast = tickStart;

    for (const id in this.players) {
      const p = this.players[id];
      if (p && (p.isSpectator || !p.alive) && !this.spectatorFollows.has(id)) {
        this._assignFollowTarget(id);
      }
    }
    specManager.cleanStaleFollows(this);

    this._playerList.length = 0;
    let serverLevelSum = 0;
    for (const id in this.players) {
      const p = this.players[id];
      if (p.isSpectator) continue;
      serverLevelSum += p.lvl || 1;
      this._playerList.push(p);
    }
    const playerBlock = bp.buildPlayerBlock(this._playerList);
    this.currentServerLevel = serverLevelSum;

    const emitTime = Date.now();
    if (this.lastEmitTime && emitTime - this.lastEmitTime > 100) console.log(`[room ${this.id}] STALL broadcast gap=${emitTime - this.lastEmitTime}ms`);
    this.lastEmitTime = emitTime;

    let serverAlive = 0;
    for (const z of this.zombies) { if (z.alive) serverAlive++; }

    const bufs = new Map();
    for (const id in this.players) {
      const p = this.players[id];
      if (!p || !p.alive || p.isSpectator) continue;
      const zoom = p.cameraZoom || 1;
      const vw = p.viewW || VIEW_W;
      const vh = p.viewH || VIEW_H;
      const pHalfVW = (vw / zoom) / 2 + VIEW_MARGIN / Math.max(0.1, zoom);
      const pHalfVH = (vh / zoom) / 2 + VIEW_MARGIN / Math.max(0.1, zoom);
      this._viewZ.length = 0;
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (!z.alive) continue;
        if (!p.fullscreen) {
          const dzx = z.x - p.x; if (dzx < -pHalfVW || dzx > pHalfVW) continue;
          const dzy = z.y - p.y; if (dzy < -pHalfVH || dzy > pHalfVH) continue;
        }
        this._viewZ.push(z);
      }
      const zlist = this._viewZ.slice();
      bufs.set(id, { buf: bp.buildStateBuffer(playerBlock, this._playerList.length, this.currentServerLevel, zlist, emitTime, false, p.cameraZoom || 1, p.viewW || VIEW_W, p.viewH || VIEW_H, this.zombies.length, serverAlive), zombies: zlist, zoom: p.cameraZoom || 1, viewW: p.viewW || VIEW_W, viewH: p.viewH || VIEW_H });
    }

    let specCount = 0, activeCount = 0;
    for (const id in this.players) {
      const p = this.players[id];
      if (!p) continue;
      if (!p.isSpectator && p.alive) {
        const entry = bufs.get(id);
        if (entry) { this.io.to(id).emit('state', entry.buf); p._lastStateSent = tickStart; activeCount++; }
      } else {
        const targetId = this.spectatorFollows.get(id);
        const targetEntry = targetId ? bufs.get(targetId) : null;
        if (targetEntry && p.isSpectator) {
          const specBuf = bp.buildStateBuffer(playerBlock, this._playerList.length, this.currentServerLevel, targetEntry.zombies, emitTime, true, targetEntry.zoom, targetEntry.viewW, targetEntry.viewH, this.zombies.length, serverAlive);
          this.io.to(id).emit('state', specBuf);
          p._lastStateSent = tickStart;
          specCount++;
        } else if (targetEntry) {
          this.io.to(id).emit('state', targetEntry.buf);
          p._lastStateSent = tickStart;
        } else {
          const emptyBuf = bp.buildStateBuffer(playerBlock, this._playerList.length, this.currentServerLevel, [], emitTime, p.isSpectator, 1, VIEW_W, VIEW_H, this.zombies.length, serverAlive);
          this.io.to(id).emit('state', emptyBuf);
          p._lastStateSent = tickStart;
        }
      }
    }
    if (specCount > 0 && tickStart % (BROADCAST_MS * 10) < TICK_MS) {
      console.log(`[room ${this.id}] broadcast: ${activeCount} active, ${specCount} spec followers, ${this._playerList.length} in playerBlock`);
    }

    const tickMs = Date.now() - tickStart;
    if (tickMs > 30) console.log(`[room ${this.id}] tick=${tickMs}ms players=${ids.length} zombies=${this.zombies.length}`);
  }
}

module.exports = Room;
