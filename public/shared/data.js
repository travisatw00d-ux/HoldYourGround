(function () {
  const BASE_TURN_SPEED = 12;

  const BASE_STATS = {
    speed: 13,
    attackDmg: 5,
    attackSpeed: 800,
    health: 100,
    maxHealth: 100
  };

  const SWORD_IMG_SIZE = 1254;
  const BLADE_W = 6;
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
      jab_combo1: {
        keyframes: [
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
          { offsetX: 51, offsetY: 19, scale: 0.047, rotation: 0.69 },
          { offsetX: 85, offsetY: 15, scale: 0.047, rotation: 0.67 },
          { offsetX: 59, offsetY: 15, scale: 0.047, rotation: 0.67 },
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
        ],
        segments: [19, 19, 17, 17]
      },
      jab_combo3: {
        segments: [10,10,10,10,10,10],
        keyframes: [
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
          { offsetX: 85, offsetY: 15, scale: 0.047, rotation: 0.67 },
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
          { offsetX: 85, offsetY: 15, scale: 0.047, rotation: 0.67 },
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
          { offsetX: 85, offsetY: 15, scale: 0.047, rotation: 0.67 },
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
        ],
        segments: [10, 10, 10, 10, 10, 10]
      },
    swing_combo1: {
        keyframes: [
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
          { offsetX: 23, offsetY: 24, scale: 0.047, rotation: 0.76 },
        ],
        segments: [10]
      }
    }
  };

  const ZOMBIE_ANIMATIONS = {
    attack: {
      segments: [12, 12, 12, 12, 12],
      left_hand: {
        keyframes: [
          { offsetX: 16, offsetY: -20, scale: 0.23, rotation: -1.55 },
          { offsetX: 34, offsetY: -22, scale: 0.23, rotation: -1.55 },
          { offsetX: 41, offsetY: -14, scale: 0.23, rotation: -1.55 },
          { offsetX: 17, offsetY: -23, scale: 0.23, rotation: -1.55 },
          { offsetX: 17, offsetY: -23, scale: 0.23, rotation: -1.55 },
          { offsetX: 17, offsetY: -23, scale: 0.23, rotation: -1.55 },
        ]
      },
      right_hand: {
        keyframes: [
          { offsetX: 16, offsetY: 20, scale: 0.23, rotation: -1.55 },
          { offsetX: 16, offsetY: 20, scale: 0.23, rotation: -1.55 },
          { offsetX: 16, offsetY: 20, scale: 0.23, rotation: -1.55 },
          { offsetX: 37, offsetY: 21, scale: 0.23, rotation: -1.55 },
          { offsetX: 43, offsetY: 12, scale: 0.23, rotation: -1.55 },
          { offsetX: 15, offsetY: 24, scale: 0.23, rotation: -1.55 },
        ]
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

  const MOB_TYPES = [
    { id: 'zombie',  name: 'Zombie',  emoji: '🧟', miniFrame: 'zombieminibig.png', unlockLevel: 1,  minCount: 90,  maxCount: 110, countGrowth: 2, baseHealth: 5, healthGrowth: 1.5, baseSpeed: 1.5, speedDecay: 0 },
    { id: 'troll',   name: 'Troll',   emoji: '👹', unlockLevel: 5,  minCount: 5,   maxCount: 15,  countGrowth: 1, baseHealth: 15, healthGrowth: 2,   baseSpeed: 1.3, speedDecay: 0 },
    { id: 'goblin',  name: 'Goblin',  emoji: '👺', unlockLevel: 10, minCount: 3,   maxCount: 10,  countGrowth: 1, baseHealth: 8,  healthGrowth: 1.8, baseSpeed: 1.6, speedDecay: 0.01 },
  ];

  const KNIGHT_BLADE_TIP_X = -5;
  const KNIGHT_BLADE_TIP_Y = -74;
  const KNIGHT_BLADE_HILT_X = 4;
  const KNIGHT_BLADE_HILT_Y = 16;

  const KNIGHT_VISUALS = {
    jab: {
      knight_sword: { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
      knight_hand:  { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 }
    },
    swing: {
      knight_sword: { offsetX: 25, offsetY: -43, scale: 0.43, rotation: -0.42 },
      knight_hand:  { offsetX: 3, offsetY: -33, scale: 0.383, rotation: -0.09 }
    }
  };

  const KNIGHT_ANIMATIONS = {
    jab_combo1: {
      segments: [30, 30],
      knight_sword: {
        keyframes: [
          { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
          { offsetX: 77, offsetY: 17, scale: 0.43, rotation: 1.38 },
          { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
        ]
      },
      knight_hand: {
        keyframes: [
          { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
          { offsetX: 7, offsetY: -31, scale: 0.383, rotation: -0.22 },
          { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
        ]
      }
    },
    jab_combo3: {
      segments: [10,10,10,10,10,10],
      knight_sword: {
        keyframes: [
          { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
          { offsetX: 77, offsetY: 17, scale: 0.43, rotation: 1.38 },
          { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
          { offsetX: 77, offsetY: 17, scale: 0.43, rotation: 1.38 },
          { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
          { offsetX: 77, offsetY: 17, scale: 0.43, rotation: 1.38 },
          { offsetX: 19, offsetY: 37, scale: 0.43, rotation: 1.65 },
        ]
      },
      knight_hand: {
        keyframes: [
          { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
          { offsetX: 7, offsetY: -31, scale: 0.383, rotation: -0.22 },
          { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
          { offsetX: 7, offsetY: -31, scale: 0.383, rotation: -0.22 },
          { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
          { offsetX: 7, offsetY: -31, scale: 0.383, rotation: -0.22 },
          { offsetX: 25, offsetY: -17, scale: 0.383, rotation: 0.14 },
        ]
      }
    },
    swing_combo1: {
      segments: [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
      knight_sword: {
        keyframes: [
          { offsetX: 25, offsetY: -43, scale: 0.43, rotation: -0.42 },
          { offsetX: 28, offsetY: -42, scale: 0.43, rotation: -0.33 },
          { offsetX: 36, offsetY: -37, scale: 0.43, rotation: -0.09 },
          { offsetX: 46, offsetY: -28, scale: 0.43, rotation: 0.27 },
          { offsetX: 54, offsetY: -13, scale: 0.43, rotation: 0.71 },
          { offsetX: 58, offsetY: 6, scale: 0.43, rotation: 1.18 },
          { offsetX: 56, offsetY: 26, scale: 0.43, rotation: 1.65 },
          { offsetX: 47, offsetY: 43, scale: 0.43, rotation: 2.09 },
          { offsetX: 35, offsetY: 55, scale: 0.43, rotation: 2.45 },
          { offsetX: 26, offsetY: 62, scale: 0.43, rotation: 2.69 },
          { offsetX: 22, offsetY: 64, scale: 0.43, rotation: 2.78 },
          { offsetX: 26, offsetY: 62, scale: 0.43, rotation: 2.69 },
          { offsetX: 35, offsetY: 55, scale: 0.43, rotation: 2.45 },
          { offsetX: 47, offsetY: 43, scale: 0.43, rotation: 2.09 },
          { offsetX: 56, offsetY: 26, scale: 0.43, rotation: 1.65 },
          { offsetX: 58, offsetY: 6, scale: 0.43, rotation: 1.18 },
          { offsetX: 54, offsetY: -13, scale: 0.43, rotation: 0.71 },
          { offsetX: 46, offsetY: -28, scale: 0.43, rotation: 0.27 },
          { offsetX: 36, offsetY: -37, scale: 0.43, rotation: -0.09 },
          { offsetX: 28, offsetY: -42, scale: 0.43, rotation: -0.33 },
          { offsetX: 25, offsetY: -43, scale: 0.43, rotation: -0.42 },
        ]
      },
      knight_hand: {
        keyframes: [
          { offsetX: 3, offsetY: -33, scale: 0.383, rotation: -0.09 },
          { offsetX: 4, offsetY: -33, scale: 0.383, rotation: -0.08 },
          { offsetX: 6, offsetY: -33, scale: 0.383, rotation: -0.07 },
          { offsetX: 9, offsetY: -32, scale: 0.383, rotation: -0.04 },
          { offsetX: 13, offsetY: -32, scale: 0.383, rotation: -0.01 },
          { offsetX: 16, offsetY: -30, scale: 0.383, rotation: 0.02 },
          { offsetX: 20, offsetY: -28, scale: 0.383, rotation: 0.05 },
          { offsetX: 23, offsetY: -26, scale: 0.383, rotation: 0.08 },
          { offsetX: 26, offsetY: -24, scale: 0.383, rotation: 0.11 },
          { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
          { offsetX: 28, offsetY: -22, scale: 0.383, rotation: 0.13 },
          { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
          { offsetX: 26, offsetY: -24, scale: 0.383, rotation: 0.11 },
          { offsetX: 23, offsetY: -26, scale: 0.383, rotation: 0.08 },
          { offsetX: 20, offsetY: -28, scale: 0.383, rotation: 0.05 },
          { offsetX: 16, offsetY: -30, scale: 0.383, rotation: 0.02 },
          { offsetX: 13, offsetY: -32, scale: 0.383, rotation: -0.01 },
          { offsetX: 9, offsetY: -32, scale: 0.383, rotation: -0.04 },
          { offsetX: 6, offsetY: -33, scale: 0.383, rotation: -0.07 },
          { offsetX: 4, offsetY: -33, scale: 0.383, rotation: -0.08 },
          { offsetX: 3, offsetY: -33, scale: 0.383, rotation: -0.09 },
        ]
      }
    },
    swing_combo2: {
      segments: [3,3,3,3,3,3,3,3,3,3],
      knight_sword: {
        keyframes: [
          { offsetX: 22, offsetY: 64, scale: 0.43, rotation: 2.78 },
          { offsetX: 27, offsetY: 62, scale: 0.43, rotation: 2.69 },
          { offsetX: 39, offsetY: 57, scale: 0.43, rotation: 2.43 },
          { offsetX: 54, offsetY: 44, scale: 0.43, rotation: 2.05 },
          { offsetX: 68, offsetY: 23, scale: 0.43, rotation: 1.59 },
          { offsetX: 73, offsetY: -4, scale: 0.43, rotation: 1.09 },
          { offsetX: 67, offsetY: -32, scale: 0.43, rotation: 0.6 },
          { offsetX: 53, offsetY: -54, scale: 0.43, rotation: 0.14 },
          { offsetX: 35, offsetY: -68, scale: 0.43, rotation: -0.24 },
          { offsetX: 21, offsetY: -74, scale: 0.43, rotation: -0.5 },
          { offsetX: 16, offsetY: -76, scale: 0.43, rotation: -0.59 },
        ]
      },
      knight_hand: {
        keyframes: [
          { offsetX: 28, offsetY: -22, scale: 0.383, rotation: 0.13 },
          { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
          { offsetX: 25, offsetY: -25, scale: 0.383, rotation: 0.09 },
          { offsetX: 22, offsetY: -28, scale: 0.383, rotation: 0.04 },
          { offsetX: 18, offsetY: -30, scale: 0.383, rotation: -0.02 },
          { offsetX: 14, offsetY: -33, scale: 0.383, rotation: -0.08 },
          { offsetX: 9, offsetY: -34, scale: 0.383, rotation: -0.15 },
          { offsetX: 4, offsetY: -35, scale: 0.383, rotation: -0.21 },
          { offsetX: 0, offsetY: -35, scale: 0.383, rotation: -0.26 },
          { offsetX: -3, offsetY: -35, scale: 0.383, rotation: -0.29 },
          { offsetX: -4, offsetY: -35, scale: 0.383, rotation: -0.3 },
        ]
      }
    },
    swing_combo3: {
      segments: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
      knight_sword: {
        keyframes: [
          { offsetX: 25, offsetY: -43, scale: 0.43, rotation: -0.42 },
          { offsetX: 28, offsetY: -42, scale: 0.43, rotation: -0.33 },
          { offsetX: 36, offsetY: -37, scale: 0.43, rotation: -0.09 },
          { offsetX: 46, offsetY: -28, scale: 0.43, rotation: 0.27 },
          { offsetX: 54, offsetY: -13, scale: 0.43, rotation: 0.71 },
          { offsetX: 58, offsetY: 6, scale: 0.43, rotation: 1.18 },
          { offsetX: 56, offsetY: 26, scale: 0.43, rotation: 1.65 },
          { offsetX: 47, offsetY: 43, scale: 0.43, rotation: 2.09 },
          { offsetX: 35, offsetY: 55, scale: 0.43, rotation: 2.45 },
          { offsetX: 26, offsetY: 62, scale: 0.43, rotation: 2.69 },
          { offsetX: 22, offsetY: 64, scale: 0.43, rotation: 2.78 },
          { offsetX: 27, offsetY: 62, scale: 0.43, rotation: 2.69 },
          { offsetX: 39, offsetY: 57, scale: 0.43, rotation: 2.43 },
          { offsetX: 54, offsetY: 44, scale: 0.43, rotation: 2.05 },
          { offsetX: 68, offsetY: 23, scale: 0.43, rotation: 1.59 },
          { offsetX: 73, offsetY: -4, scale: 0.43, rotation: 1.09 },
          { offsetX: 67, offsetY: -32, scale: 0.43, rotation: 0.60 },
          { offsetX: 53, offsetY: -54, scale: 0.43, rotation: 0.14 },
          { offsetX: 35, offsetY: -68, scale: 0.43, rotation: -0.24 },
          { offsetX: 21, offsetY: -74, scale: 0.43, rotation: -0.50 },
          { offsetX: 16, offsetY: -76, scale: 0.43, rotation: -0.59 },
        ]
      },
      knight_hand: {
        keyframes: [
          { offsetX: 3, offsetY: -33, scale: 0.383, rotation: -0.09 },
          { offsetX: 4, offsetY: -33, scale: 0.383, rotation: -0.08 },
          { offsetX: 6, offsetY: -33, scale: 0.383, rotation: -0.07 },
          { offsetX: 9, offsetY: -32, scale: 0.383, rotation: -0.04 },
          { offsetX: 13, offsetY: -32, scale: 0.383, rotation: -0.01 },
          { offsetX: 16, offsetY: -30, scale: 0.383, rotation: 0.02 },
          { offsetX: 20, offsetY: -28, scale: 0.383, rotation: 0.05 },
          { offsetX: 23, offsetY: -26, scale: 0.383, rotation: 0.08 },
          { offsetX: 26, offsetY: -24, scale: 0.383, rotation: 0.11 },
          { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
          { offsetX: 28, offsetY: -22, scale: 0.383, rotation: 0.13 },
          { offsetX: 27, offsetY: -23, scale: 0.383, rotation: 0.12 },
          { offsetX: 25, offsetY: -25, scale: 0.383, rotation: 0.09 },
          { offsetX: 22, offsetY: -28, scale: 0.383, rotation: 0.04 },
          { offsetX: 18, offsetY: -30, scale: 0.383, rotation: -0.02 },
          { offsetX: 14, offsetY: -33, scale: 0.383, rotation: -0.08 },
          { offsetX: 9, offsetY: -34, scale: 0.383, rotation: -0.15 },
          { offsetX: 4, offsetY: -35, scale: 0.383, rotation: -0.21 },
          { offsetX: 0, offsetY: -35, scale: 0.383, rotation: -0.26 },
          { offsetX: -3, offsetY: -35, scale: 0.383, rotation: -0.29 },
          { offsetX: -4, offsetY: -35, scale: 0.383, rotation: -0.30 },
        ]
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MOB_TYPES, BASE_STATS, BASE_TURN_SPEED, ITEMS, ITEM_VISUALS, ANIMATIONS, SWORD_IMG_SIZE, BLADE_W, BLADE_TIP_X, BLADE_TIP_Y, BLADE_HILT_X, BLADE_HILT_Y, ZOMBIE_VISUALS, ZOMBIE_ANIMATIONS, SCREEN_UI, KNIGHT_VISUALS, KNIGHT_ANIMATIONS, KNIGHT_BLADE_TIP_X, KNIGHT_BLADE_TIP_Y, KNIGHT_BLADE_HILT_X, KNIGHT_BLADE_HILT_Y };
  } else {
    window.BASE_TURN_SPEED = BASE_TURN_SPEED;
    window.BASE_STATS = BASE_STATS;
    window.ITEMS = ITEMS;
    window.ITEM_VISUALS = ITEM_VISUALS;
    window.ANIMATIONS = ANIMATIONS;
    window.SWORD_IMG_SIZE = SWORD_IMG_SIZE;
    window.BLADE_W = BLADE_W;
    window.BLADE_TIP_X = BLADE_TIP_X;
    window.BLADE_TIP_Y = BLADE_TIP_Y;
    window.BLADE_HILT_X = BLADE_HILT_X;
    window.BLADE_HILT_Y = BLADE_HILT_Y;
    window.ZOMBIE_VISUALS = ZOMBIE_VISUALS;
    window.ZOMBIE_ANIMATIONS = ZOMBIE_ANIMATIONS;
    window.MOB_TYPES = MOB_TYPES;
    window.SCREEN_UI = SCREEN_UI;
    window.KNIGHT_VISUALS = KNIGHT_VISUALS;
    window.KNIGHT_ANIMATIONS = KNIGHT_ANIMATIONS;
    window.KNIGHT_BLADE_TIP_X = KNIGHT_BLADE_TIP_X;
    window.KNIGHT_BLADE_TIP_Y = KNIGHT_BLADE_TIP_Y;
    window.KNIGHT_BLADE_HILT_X = KNIGHT_BLADE_HILT_X;
    window.KNIGHT_BLADE_HILT_Y = KNIGHT_BLADE_HILT_Y;
  }
})();
