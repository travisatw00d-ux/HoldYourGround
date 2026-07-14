// Validation tests for the item generation system (item-generator.js),
// including the guaranteed-stacked-attribute system (Rare+ items always
// contain one intentionally repeated attribute — see
// Workflow/item-generation-system.md). Not wired into any test framework —
// this project doesn't have one (see editing-server.md's "Verify" section,
// which is just node -c + manual smoke testing) — so this is a plain Node
// script using the built-in `assert` module. Run with:
//   node server/test-item-generator.js
// Exits non-zero if any assertion fails, so it can be wired into a CI step
// later without changes.
//
// item-generator.js's functions all accept an injectable `rng` (defaulting
// to Math.random) specifically so tests here can force deterministic
// outcomes (which rarity gets rolled, which attribute gets stacked, which
// value gets rolled) instead of relying on statistical luck for exact-value
// assertions. The genuinely statistical tests (rarity weight distribution,
// independent stack value rolls) use plain Math.random over a large sample
// instead, since exact repeatability isn't the point there.
const assert = require('assert');
const { ITEMS, ITEM_RARITIES, ITEM_ATTRIBUTES } = require('./config');
const gen = require('./item-generator');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok - ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL - ' + name);
    console.log('    ' + e.message);
  }
}

// Deterministic rng that always lands rollItemRarity() on `targetId` —
// picks the midpoint of that rarity's slice of the normalized [0,1) range.
// Reused for every subsequent rng() call inside generateItemInstance() too
// (stack selection, attribute selection, value rolls), which is fine: it
// just makes those picks deterministic as well, not undefined behavior —
// selectRandomAttributes' internal array-shrinking means a constant rng()
// still yields a valid, varied set of picks (see that function's comments).
function rngForRarity(targetId) {
  const total = ITEM_RARITIES.reduce((s, r) => s + r.weight, 0);
  let cum = 0;
  for (const r of ITEM_RARITIES) {
    if (r.id === targetId) {
      const mid = (cum + r.weight / 2) / total;
      return () => mid;
    }
    cum += r.weight;
  }
  throw new Error('unknown rarity id: ' + targetId);
}

// Forces the rarity roll deterministically (same trick as rngForRarity)
// but delegates every SUBSEQUENT rng() call to Math.random — needed for
// tests that want a forced rarity but genuinely independent/varied
// downstream rolls (e.g. proving stacked copies aren't hardcoded to match).
function rngForRarityThenRandom(targetId) {
  const total = ITEM_RARITIES.reduce((s, r) => s + r.weight, 0);
  let cum = 0;
  let mid = null;
  for (const r of ITEM_RARITIES) {
    if (r.id === targetId) { mid = (cum + r.weight / 2) / total; break; }
    cum += r.weight;
  }
  if (mid === null) throw new Error('unknown rarity id: ' + targetId);
  let usedFirst = false;
  return () => {
    if (!usedFirst) { usedFirst = true; return mid; }
    return Math.random();
  };
}

// Minimal seeded PRNG (mulberry32) for the repeatability test — same seed
// must produce the exact same sequence of values across two independent
// generator instances.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Counts occurrences of each attributeId in a generated attributes array —
// used repeatedly below to check stack shape (exactly one id repeated the
// right number of times, everything else appearing once).
function countByAttributeId(attributes) {
  const counts = {};
  for (const a of attributes) counts[a.attributeId] = (counts[a.attributeId] || 0) + 1;
  return counts;
}

console.log('Item Generator validation\n');

console.log('Attribute count + guaranteed stacking per rarity:');
const EXPECTED_STACK = {
  common: 0, uncommon: 0, rare: 2, epic: 2, legendary: 2, mythic: 3, ungodly: 3
};
const EXPECTED_PREFIX = {
  common: null, uncommon: null, rare: 'Greater', epic: 'Greater', legendary: 'Greater', mythic: 'Superior', ungodly: 'Superior'
};

for (const rarity of ITEM_RARITIES) {
  const expectedStackSize = EXPECTED_STACK[rarity.id];
  test(rarity.name + ' items always receive exactly ' + rarity.attributeCount + ' attribute roll(s)', () => {
    for (let i = 0; i < 30; i++) {
      const instance = gen.generateItemInstance('t1_ring', 1, rngForRarity(rarity.id));
      assert.strictEqual(instance.rarityId, rarity.id, 'rngForRarity did not land on ' + rarity.id);
      assert.strictEqual(instance.attributes.length, rarity.attributeCount,
        'expected exactly ' + rarity.attributeCount + ' total rolls (the stack counts toward the total, not on top of it)');
    }
  });

  if (expectedStackSize > 1) {
    test(rarity.name + ' always contains its required ' + expectedStackSize + 'x stack, never a different size', () => {
      for (let i = 0; i < 30; i++) {
        const instance = gen.generateItemInstance('t1_ring', 1, rngForRarity(rarity.id));
        const counts = countByAttributeId(instance.attributes);
        const stackedEntries = Object.entries(counts).filter(([, c]) => c > 1);
        assert.strictEqual(stackedEntries.length, 1,
          'expected exactly one stacked (duplicated) attribute group, found ' + stackedEntries.length +
          ' (' + JSON.stringify(counts) + ') — Rare/Epic/Legendary must not accidentally become a triple stack, and Mythic/Ungodly must not gain a second duplicate group');
        const [stackedId, stackedCount] = stackedEntries[0];
        assert.strictEqual(stackedCount, expectedStackSize,
          rarity.id + ' stacked attribute "' + stackedId + '" appeared ' + stackedCount + ' times, expected exactly ' + expectedStackSize);
        // Every non-stacked attribute must appear exactly once (no
        // secondary duplicate group hiding alongside the intentional one).
        for (const [id, count] of Object.entries(counts)) {
          if (id === stackedId) continue;
          assert.strictEqual(count, 1, 'non-stacked attribute "' + id + '" unexpectedly duplicated (' + count + 'x)');
        }
        // stackData must describe the same attribute/size.
        assert.ok(instance.stackData, 'expected stackData to be present');
        assert.strictEqual(instance.stackData.attributeId, stackedId);
        assert.strictEqual(instance.stackData.stackSize, expectedStackSize);
      }
    });
  } else {
    test(rarity.name + ' never contains a forced duplicate', () => {
      for (let i = 0; i < 30; i++) {
        const instance = gen.generateItemInstance('t1_ring', 1, rngForRarity(rarity.id));
        const counts = countByAttributeId(instance.attributes);
        assert.ok(Object.values(counts).every(c => c === 1), rarity.id + ' should never force a duplicate attribute');
        assert.strictEqual(instance.stackData, null, rarity.id + ' should have no stackData');
      }
    });
  }
}

console.log('\nStack exact-attribute-type matching (flat vs scaling are separate types):');
test('every copy in a stack uses the exact same attributeId (flat and scaling never mixed)', () => {
  for (let i = 0; i < 30; i++) {
    const instance = gen.generateItemInstance('t1_ring', 1, rngForRarity('mythic'));
    const counts = countByAttributeId(instance.attributes);
    const [stackedId] = Object.entries(counts).find(([, c]) => c > 1);
    const stackedEntries = instance.attributes.filter(a => a.attributeId === stackedId);
    assert.ok(stackedEntries.every(a => a.attributeId === stackedId));
    // Sanity: attackDamageFlat and attackDamageScaling really are distinct
    // ids sharing a stat, confirming the "exact match" requirement is
    // meaningful (not vacuously true because there's only one per stat).
    assert.notStrictEqual(ITEM_ATTRIBUTES.attackDamageFlat.id, ITEM_ATTRIBUTES.attackDamageScaling.id);
  }
});

console.log('\nEach stacked copy rolls its value independently:');
test('stacked copies are not hardcoded to the same value across many samples', () => {
  const allValues = [];
  for (let i = 0; i < 100; i++) {
    const instance = gen.generateItemInstance('t1_ring', 1, rngForRarityThenRandom('mythic'));
    const counts = countByAttributeId(instance.attributes);
    const [stackedId] = Object.entries(counts).find(([, c]) => c > 1);
    const values = instance.attributes.filter(a => a.attributeId === stackedId).map(a => a.value);
    allValues.push(...values);
  }
  assert.ok(new Set(allValues).size > 1, 'every stacked value across 100 mythic items was identical — values are not being rolled independently');
});

console.log('\nItem naming:');
for (const rarity of ITEM_RARITIES) {
  const prefix = EXPECTED_PREFIX[rarity.id];
  if (prefix) {
    test(rarity.name + ' names use "of ' + prefix + ' [Attribute]" with the stacked attribute\'s itemNameText', () => {
      const instance = gen.generateItemInstance('t1_ring', 1, rngForRarity(rarity.id));
      const baseName = ITEMS.t1_ring.name;
      const stackedDef = ITEM_ATTRIBUTES[instance.stackData.attributeId];
      const expectedName = baseName + ' of ' + prefix + ' ' + stackedDef.itemNameText;
      assert.strictEqual(instance.generatedName, expectedName);
      assert.strictEqual(instance.baseName, baseName);
    });
  } else {
    test(rarity.name + ' names are NOT modified by the stacking system', () => {
      const instance = gen.generateItemInstance('t1_ring', 1, rngForRarity(rarity.id));
      assert.strictEqual(instance.generatedName, ITEMS.t1_ring.name);
      assert.strictEqual(instance.stackData, null);
    });
  }
}

console.log('\nAttribute selection rules (non-stacked slots):');
test('exact duplicate attributes are prevented by default', () => {
  // Tiny pool (2 entries) so with allowExactDuplicateAttributes:false the
  // 3rd+ request has nothing left to pick — this also doubles as the
  // "requesting more than available" safety-cap case.
  const pool = [ITEM_ATTRIBUTES.attackDamageFlat, ITEM_ATTRIBUTES.attackDamageScaling];
  const chosen = gen.selectRandomAttributes(pool, 5, { allowExactDuplicateAttributes: false, allowFlatAndScalingPair: true }, Math.random);
  const ids = chosen.map(a => a.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate attribute id found: ' + ids.join(','));
  assert.ok(chosen.length <= pool.length, 'selection exceeded pool size without allowExactDuplicateAttributes');
});

test('flat and scaling versions of the same stat can appear together', () => {
  const pool = [ITEM_ATTRIBUTES.attackDamageFlat, ITEM_ATTRIBUTES.attackDamageScaling];
  let sawBothTogether = false;
  for (let i = 0; i < 50 && !sawBothTogether; i++) {
    const chosen = gen.selectRandomAttributes(pool, 2, { allowExactDuplicateAttributes: false, allowFlatAndScalingPair: true }, Math.random);
    if (chosen.length === 2) sawBothTogether = true;
  }
  assert.ok(sawBothTogether, 'flat+scaling pair never appeared together across 50 attempts');
});

test('allowFlatAndScalingPair:false makes flat/scaling mutually exclusive', () => {
  const pool = [ITEM_ATTRIBUTES.attackDamageFlat, ITEM_ATTRIBUTES.attackDamageScaling];
  for (let i = 0; i < 20; i++) {
    const chosen = gen.selectRandomAttributes(pool, 2, { allowExactDuplicateAttributes: false, allowFlatAndScalingPair: false }, Math.random);
    assert.strictEqual(chosen.length, 1, 'expected exactly 1 pick when the pair shares a stat and pairing is disallowed');
  }
});

test('allowExactDuplicateAttributes:true allows sampling the same id repeatedly', () => {
  const pool = [ITEM_ATTRIBUTES.attackDamageFlat];
  const chosen = gen.selectRandomAttributes(pool, 4, { allowExactDuplicateAttributes: true, allowFlatAndScalingPair: true }, Math.random);
  assert.strictEqual(chosen.length, 4);
  assert.ok(chosen.every(a => a.id === 'attackDamageFlat'));
});

test('invalid/empty attribute pools fail safely (no throw, no infinite loop)', () => {
  assert.deepStrictEqual(gen.selectRandomAttributes([], 5), []);
  assert.deepStrictEqual(gen.selectRandomAttributes(null, 5), []);
  assert.deepStrictEqual(gen.selectRandomAttributes(Object.values(ITEM_ATTRIBUTES), 0), []);
  assert.strictEqual(gen.selectRandomAttribute([], Math.random), null);
  assert.strictEqual(gen.selectRandomAttribute(null, Math.random), null);
});

console.log('\nStacking edge cases (small/invalid attribute pools):');
test('a pool with only one eligible attribute still generates safely (stack consumes it, remaining capped to 0)', () => {
  const pool = [ITEM_ATTRIBUTES.armorFlat];
  const result = gen.generateItemAttributes({ rarityId: 'rare', attributePool: pool, itemTier: 1, rng: Math.random });
  assert.ok(result.attributes.length <= 3, 'should never exceed the requested total');
  assert.ok(result.attributes.length >= 2, 'the stack itself (2x) should still be generated from the single-attribute pool');
  assert.ok(result.attributes.every(a => a.attributeId === 'armorFlat'));
});

test('a completely empty attribute pool degrades to an unstacked, empty result without throwing', () => {
  const result = gen.generateItemAttributes({ rarityId: 'mythic', attributePool: [], itemTier: 1, rng: Math.random });
  assert.deepStrictEqual(result.attributes, []);
  assert.strictEqual(result.stackedAttribute, null);
});

test('generateItemInstance never throws even with a degenerate pool (unknown tier collapses ranges safely)', () => {
  assert.doesNotThrow(() => gen.generateItemInstance('t1_ring', 1, Math.random));
});

console.log('\nRolled values stay inside configured ranges:');
test('every attribute rolls within its min/max for 200 samples each', () => {
  for (const attr of Object.values(ITEM_ATTRIBUTES)) {
    const range = attr.ranges[1];
    const tolerance = Math.pow(10, -(range.precision ?? 0));
    for (let i = 0; i < 200; i++) {
      const value = gen.rollAttributeValue(attr, 1, Math.random);
      assert.ok(value >= range.min - tolerance && value <= range.max + tolerance,
        attr.id + ' rolled ' + value + ' outside [' + range.min + ', ' + range.max + ']');
    }
  }
});

console.log('\nInstance identity and serialization:');
test('every generated item has a unique instance ID', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) {
    const instance = gen.generateItemInstance('t1_ring', 1, Math.random);
    assert.ok(!ids.has(instance.instanceId), 'duplicate instanceId: ' + instance.instanceId);
    ids.add(instance.instanceId);
  }
});

test('saving and loading (JSON round-trip) preserves rolled attributes exactly', () => {
  const instance = gen.generateItemInstance('t1_necklace', 1, rngForRarity('legendary'));
  const roundTripped = JSON.parse(JSON.stringify(instance));
  assert.deepStrictEqual(roundTripped, instance);
});

test('saving and loading preserves generatedName and stackData for a stacked item', () => {
  const instance = gen.generateItemInstance('t1_ring', 1, rngForRarity('ungodly'));
  assert.ok(instance.generatedName.includes('of Superior'));
  assert.ok(instance.stackData);
  const roundTripped = JSON.parse(JSON.stringify(instance));
  assert.strictEqual(roundTripped.generatedName, instance.generatedName);
  assert.deepStrictEqual(roundTripped.stackData, instance.stackData);
  assert.strictEqual(roundTripped.baseName, instance.baseName);
});

test('generateItemInstance returns null for an unknown base item id', () => {
  assert.strictEqual(gen.generateItemInstance('not_a_real_item', 1, Math.random), null);
});

console.log('\nSeeded RNG repeatability:');
test('the same seed produces an identical stacked instance (minus instanceId)', () => {
  const a = gen.generateItemInstance('t1_ring', 1, mulberry32(12345));
  const b = gen.generateItemInstance('t1_ring', 1, mulberry32(12345));
  const stripId = (inst) => { const { instanceId, ...rest } = inst; return rest; };
  assert.deepStrictEqual(stripId(a), stripId(b));
});

console.log('\nRarity weight normalization (100,000-roll simulation):');
test('rolled distribution is reasonably close to configured relative weights', () => {
  const trials = 100000;
  const counts = {};
  for (const r of ITEM_RARITIES) counts[r.id] = 0;
  for (let i = 0; i < trials; i++) {
    counts[gen.rollItemRarity(Math.random).id]++;
  }
  const totalWeight = ITEM_RARITIES.reduce((s, r) => s + r.weight, 0);
  for (const r of ITEM_RARITIES) {
    const expected = (r.weight / totalWeight) * trials;
    const actual = counts[r.id];
    // Generous tolerance for the smallest buckets (ungodly expects ~500
    // hits out of 100k) — allow the larger of 25% relative error or 60
    // absolute hits, so this doesn't flake on legitimate variance.
    const tolerance = Math.max(expected * 0.25, 60);
    assert.ok(Math.abs(actual - expected) <= tolerance,
      r.id + ': expected ~' + expected.toFixed(0) + ', got ' + actual + ' (tolerance ' + tolerance.toFixed(0) + ')');
  }
});

console.log('\nLuck-adjusted rarity odds:');
test('luck <= 0 leaves the rarity table unchanged', () => {
  const table = gen.getLuckAdjustedRarities(0);
  assert.deepStrictEqual(table, ITEM_RARITIES);
  assert.deepStrictEqual(gen.getLuckAdjustedRarities(-5), ITEM_RARITIES);
});

test('total weight is conserved across a range of luck values (redistributed, not just added)', () => {
  const baseTotal = ITEM_RARITIES.reduce((s, r) => s + r.weight, 0);
  for (const luck of [1, 10, 50, 100, 250, 1000, 100000]) {
    const table = gen.getLuckAdjustedRarities(luck);
    const total = table.reduce((s, r) => s + r.weight, 0);
    assert.ok(Math.abs(total - baseTotal) < 1e-9, 'luck=' + luck + ': total weight drifted from ' + baseTotal + ' to ' + total);
  }
});

test('at luck=100, every luckBoosted rarity\'s weight exactly doubles', () => {
  const table = gen.getLuckAdjustedRarities(100);
  for (const r of ITEM_RARITIES) {
    const adjusted = table.find(t => t.id === r.id);
    if (r.luckBoosted) {
      assert.ok(Math.abs(adjusted.weight - r.weight * 2) < 1e-9,
        r.id + ': expected weight ' + (r.weight * 2) + ' at luck=100, got ' + adjusted.weight);
    }
  }
});

test('common/uncommon weight shrinks as luck increases, never goes negative', () => {
  let prevCommon = Infinity;
  for (const luck of [0, 25, 50, 100, 200, 500, 100000]) {
    const table = gen.getLuckAdjustedRarities(luck);
    const common = table.find(r => r.id === 'common');
    const uncommon = table.find(r => r.id === 'uncommon');
    assert.ok(common.weight >= 0, 'common weight went negative at luck=' + luck);
    assert.ok(uncommon.weight >= 0, 'uncommon weight went negative at luck=' + luck);
    assert.ok(common.weight <= prevCommon + 1e-9, 'common weight should be non-increasing as luck rises (luck=' + luck + ')');
    prevCommon = common.weight;
  }
});

test('luckBoosted rarities keep the same proportions relative to each other at every luck level', () => {
  // Rare:Epic ratio (10:5 = 2:1 at base) should stay 2:1 no matter how much
  // of common/uncommon's share they've collectively absorbed.
  for (const luck of [10, 100, 1000, 50000]) {
    const table = gen.getLuckAdjustedRarities(luck);
    const rare = table.find(r => r.id === 'rare');
    const epic = table.find(r => r.id === 'epic');
    assert.ok(Math.abs(rare.weight / epic.weight - 2) < 1e-9, 'rare:epic ratio drifted at luck=' + luck);
  }
});

test('rollItemRarity(rng, 0) behaves identically to the no-luck default', () => {
  for (let i = 0; i < 50; i++) {
    const r = Math.random();
    const rng = () => r;
    assert.strictEqual(gen.rollItemRarity(rng).id, gen.rollItemRarity(rng, 0).id);
  }
});

test('luck=100 roughly doubles the real hit-rate of high rarities (100,000-roll simulation)', () => {
  const trials = 100000;
  const countsNoLuck = { rare: 0, ungodly: 0 };
  const countsWithLuck = { rare: 0, ungodly: 0 };
  for (let i = 0; i < trials; i++) {
    const noLuckId = gen.rollItemRarity(Math.random, 0).id;
    if (noLuckId === 'rare') countsNoLuck.rare++;
    if (noLuckId === 'ungodly') countsNoLuck.ungodly++;
    const withLuckId = gen.rollItemRarity(Math.random, 100).id;
    if (withLuckId === 'rare') countsWithLuck.rare++;
    if (withLuckId === 'ungodly') countsWithLuck.ungodly++;
  }
  for (const id of ['rare', 'ungodly']) {
    const ratio = countsWithLuck[id] / countsNoLuck[id];
    assert.ok(ratio > 1.6 && ratio < 2.4,
      id + ': expected luck=100 hit-rate to be roughly 2x luck=0 hit-rate, got ratio ' + ratio.toFixed(2) +
      ' (' + countsNoLuck[id] + ' -> ' + countsWithLuck[id] + ')');
  }
});

test('generateItemInstance passes luck through to the rarity roll end-to-end', () => {
  // Total weight is conserved at every luck level, so a fixed rng() fraction
  // always produces the exact same raw `roll` value (roll = rng() *
  // totalWeight) — only the cumulative bucket BOUNDARIES move. At luck=0,
  // roll=65 falls in uncommon's [50, 80) slice. At luck=100, common/uncommon
  // shrink (uncommon's slice becomes ~[37.8, 60.5)) and rare's slice grows
  // and shifts down to start at 60.5, so the same roll=65 now falls in
  // rare's [60.5, 80.5) slice instead — proving luck actually reshuffles
  // which bucket a given roll lands in, not just rare's own share.
  const fixedRoll = 65 / 99.5;
  const rngFixed = () => fixedRoll;
  const noLuck = gen.generateItemInstance('t1_ring', 1, rngFixed, 0);
  const withLuck = gen.generateItemInstance('t1_ring', 1, rngFixed, 100);
  assert.strictEqual(noLuck.rarityId, 'uncommon');
  assert.strictEqual(withLuck.rarityId, 'rare', 'expected luck=100 to shift the same raw roll from uncommon into rare');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
