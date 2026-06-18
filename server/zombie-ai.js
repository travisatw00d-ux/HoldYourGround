const { ZOMBIE_DAMAGE, ZOMBIE_RADIUS, ZOMBIE_COUNT, WORLD_W, WORLD_H, ZOMBIE_MARGIN, getZombieStats } = require('./config.js');
const { players, zombies, randomZombieSpawn } = require('./game-state.js');
const getIo = () => require('./io.js').getIo();

function moveZombies() {
  for (const z of zombies) {
    if (!z.alive) continue;
    let target = null;

    if (z.isStray) {
      let closestD2 = Infinity;
      for (const other of zombies) {
        if (other.id === z.id || !other.alive) continue;
        const dx = other.x - z.x, dy = other.y - z.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < closestD2) { closestD2 = d2; target = other; }
      }
    } else if (z.strayCalled) {
      let closestD2 = Infinity;
      for (const other of zombies) {
        if (other.id === z.id || !other.alive || !other.isStray) continue;
        const dx = other.x - z.x, dy = other.y - z.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < closestD2) { closestD2 = d2; target = other; }
      }
    }

    if (!target) {
      let closestD2 = Infinity;
      for (const id in players) {
        const p = players[id];
        if (!p.alive) continue;
        const dx = p.x - z.x, dy = p.y - z.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < closestD2) { closestD2 = d2; target = p; }
      }
    }

    if (target) {
      const dx = target.x - z.x, dy = target.y - z.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      z.headingtoward = target.name || target.id || '';
      z.headingAngle = Math.atan2(dy, dx);
      const mx = (dx / dist) * z.speed, my = (dy / dist) * z.speed;
      z.x += mx;
      z.y += my;
      z.x = Math.max(z.radius, Math.min(WORLD_W - z.radius, z.x));
      z.y = Math.max(z.radius, Math.min(WORLD_H - z.radius, z.y));

      if (z.isStray && target.isStray !== undefined) target.strayCalled = true;

      if (target.name !== undefined && dist < z.radius + target.radius && target.alive) {
        target.health -= ZOMBIE_DAMAGE;
        if (target.health <= 0 && target.alive) {
          target.alive = false;
          getIo().to(target.id).emit('eliminated', { kills: target.kills });
        }
      }
    }
  }
}

function mergeZombies() {
  const toRemove = [];
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i];
    if (!a.alive || toRemove.includes(a.id)) continue;
    for (let j = i + 1; j < zombies.length; j++) {
      const b = zombies[j];
      if (!b.alive || toRemove.includes(b.id)) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy < (a.radius + b.radius) * (a.radius + b.radius)) {
        toRemove.push(a.id, b.id);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const newLvl = a.lvl + b.lvl;
        const st = getZombieStats(newLvl);
        let hpPct;
        if (a.lvl === b.lvl) {
          hpPct = Math.min(1, a.health / a.maxHealth + b.health / b.maxHealth);
        } else {
          const higher = a.lvl > b.lvl ? a : b;
          hpPct = higher.health / higher.maxHealth;
        }
        zombies.push({
          id: `zombie_${Date.now()}_${Math.random()}`,
          x: mx, y: my, alive: true,
          health: Math.max(1, Math.round(st.health * hpPct)),
          maxHealth: st.health,
          radius: ZOMBIE_RADIUS, speed: st.speed,
          headingtoward: '', headingAngle: 0,
          isStray: (a.isStray || b.isStray) ? Math.random() < 0.5 : false, strayCalled: false, lvl: newLvl
        });
        getIo().emit('zombieMerge', { x: mx, y: my });
        break;
      }
    }
  }
  const survivors = zombies.filter(z => !toRemove.includes(z.id));
  zombies.length = 0;
  zombies.push(...survivors);
}

function maintainZombieCount() {
  while (zombies.length < ZOMBIE_COUNT) {
    const sp = randomZombieSpawn();
    const st = getZombieStats(1);
    zombies.push({
      id: `zombie_${Date.now()}_${Math.random()}`,
      x: sp.x, y: sp.y, alive: true,
      health: st.health, maxHealth: st.health,
      radius: ZOMBIE_RADIUS, speed: st.speed,
      headingtoward: '', headingAngle: 0,
      isStray: Math.random() < 0.2, strayCalled: false, lvl: 1
    });
  }

  for (const z of zombies) {
    if (!z.alive) {
      const sp = randomZombieSpawn();
      const st = getZombieStats(1);
      z.x = sp.x; z.y = sp.y;
      z.health = st.health;
      z.maxHealth = st.health;
      z.speed = st.speed;
      z.lvl = 1;
      z.headingAngle = 0;
      z.isStray = Math.random() < 0.2;
      z.strayCalled = false;
      z.alive = true;
    }
  }
}

module.exports = { moveZombies, mergeZombies, maintainZombieCount };
