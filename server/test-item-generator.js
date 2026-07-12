// Validation tests for the item generation system (item-generator.js).
// Not wired into any test framework — this project doesn't have one (see
// editing-server.md's "Verify" section, which is just node -c + manual
// smoke testing) — so this is a plain Node script using the built-in
// `assert` module. Run with:
//   node server/test-item-generator.js
// Exits non-zero if any assertion fails, so it can be wired into a CI step
// later without changes.
//
// item-generator.js's functions all accept an injectable `rng` (defaulting
// to Math.random) specifically so tests here can force deterministic
// outcomes (which rarity gets rolled, which attribute index gets picked)
// instead of relying on statistical luck for exact-value assertions. The
// one genuinely statistical test (rarity weight distribution) uses plain
// Math.random over a large sample instead, since exact repeatability isn't
// the point there — the point is "is the distribution close to the
// configured weights".
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
// (attribute selection/value rolls), which is fine: it just makes those
// picks deterministic as well, not undefined behavior.
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

console.log('Item Generator validation\n');

console.log('Attribute count per rarity:');
for (const rarity of ITEM_RARITIES) {
  test(rarity.name + ' items always receive ' + rarity.attributeCount + ' attribute(s)', () => {
    for (let i = 0; i < 20; i++) {
      const instance = gen.generateItemInstance('t1_ring', 1, rngForRarity(rarity.id));
      assert.strictEqual(instance.rarityId, rarity.id, 'rngForRarity did not land on ' + rarity.id);
      assert.strictEqual(instance.attributes.length, rarity.attributeCount);
    }
  });
}

console.log('\nAttribute selection rules:');
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

test('generateItemInstance returns null for an unknown base item id', () => {
  assert.strictEqual(gen.generateItemInstance('not_a_real_item', 1, Math.random), null);
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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
