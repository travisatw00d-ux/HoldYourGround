(function () {
  const BASE_STATS = {
    speed: 13,
    attackDmg: 5,
    attackSpeed: 800,
    health: 100,
    maxHealth: 100
  };

  const SWORD_IMG_SIZE = 1254;
  const SWORD_HIT_RADIUS = 18;
  const BLADE_TIP_X = 399;
  const BLADE_TIP_Y = -567;
  const BLADE_HILT_X = -366;
  const BLADE_HILT_Y = 396;

  const ITEMS = {
    wooden_sword: {
      name: 'Wooden Sword',
      type: 'weapon',
      stats: { attackDmg: 5, attackSpeed: -200 }
    }
  };

  const ITEM_VISUALS = {
    wooden_sword: {
      offsetX: 23,
      offsetY: 24,
      scale: 0.047,
      rotation: 0.76
    }
  };

  const ANIMATIONS = {
    wooden_sword: {
      attack: {
        keyframes: [
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
          { offsetX: 51, offsetY: 19, scale: 0.047, rotation: 0.69 },
          { offsetX: 85, offsetY: 15, scale: 0.047, rotation: 0.67 },
          { offsetX: 59, offsetY: 15, scale: 0.047, rotation: 0.67 },
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
        ],
        segments: [19, 19, 17, 17]
      }
    }
  };

  const ZOMBIE_VISUALS = {
    left_hand: {
      offsetX: 16,
      offsetY: -20,
      scale: 0.230,
      rotation: -1.55
    },
    right_hand: {
      offsetX: 16,
      offsetY: 20,
      scale: 0.230,
      rotation: -1.55
    }
  };

  const SCREEN_UI = {
    serverLevel: { x: 53, y: 56, scale: 0.4, ty: -6 }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BASE_STATS, ITEMS, ITEM_VISUALS, ANIMATIONS, SWORD_IMG_SIZE, BLADE_TIP_X, BLADE_TIP_Y, BLADE_HILT_X, BLADE_HILT_Y, ZOMBIE_VISUALS, SCREEN_UI };
  } else {
    window.BASE_STATS = BASE_STATS;
    window.ITEMS = ITEMS;
    window.ITEM_VISUALS = ITEM_VISUALS;
    window.ANIMATIONS = ANIMATIONS;
    window.SWORD_IMG_SIZE = SWORD_IMG_SIZE;
    window.BLADE_TIP_X = BLADE_TIP_X;
    window.BLADE_TIP_Y = BLADE_TIP_Y;
    window.BLADE_HILT_X = BLADE_HILT_X;
    window.BLADE_HILT_Y = BLADE_HILT_Y;
    window.ZOMBIE_VISUALS = ZOMBIE_VISUALS;
    window.SCREEN_UI = SCREEN_UI;
  }
})();
