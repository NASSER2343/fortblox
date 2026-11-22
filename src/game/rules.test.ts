import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDbnoDamage,
  applyStructureDamage,
  areBotsTeammates,
  assignBotSquads,
  assignMatchTeams,
  chooseBestBotSlot,
  chooseBotWeapon,
  computeAliveTeamsCount,
  computeBotFlankWaypoint,
  computeBotLeadPoint,
  computeDamageApplication,
  computeHealApplication,
  computeRankedRpDelta,
  computeRebootResult,
  computeReloadTransfer,
  computeReviveResult,
  computeShotgunPelletSpreadOffsets,
  computeStormAudioParams,
  createEmptyAmmoBag,
  dropBackpackSlot,
  findSquadWipeTargets,
  formatKeyCodeLabel,
  generatePartyCode,
  getBattleBusPose,
  getBotCombatProfile,
  getBotSkillDistribution,
  getCeilingLimitY,
  getCurrentPoiName,
  getRankFromRp,
  getTeamSizeForMode,
  getTerrainHeight,
  getWalkableSurfaceY,
  isFriendlyTarget,
  isInsideStorm,
  isPirateTokenActive,
  makeWeaponItem,
  normalizePartyCode,
  pickBotRarity,
  pickChestHealDrop,
  pickChestHealId,
  pickChestWeaponId,
  pickFloorLootDrop,
  pickRandomRarity,
  pickupForBot,
  pickupWithDrop,
  resolveBotBuildingWaypoint,
  resolveObstacleCollision,
  rollPirateToken,
  sanitizePlayerName,
  seededRng,
  segmentToPointDistSq,
  shouldBotBroadcastPing,
  shouldBotPunishHeal,
  shouldEnterDbno,
  stepChestSearchProgress,
  stepDbnoBleed,
  stepStorm,
  swapBackpackSlots,
  sweptSphereCapsuleHit,
  sweptSphereSegmentHit,
  updateKeybind,
} from './rules';
import {
  BUS_CRUISE_Y,
  CHEST_OPEN_TIME,
  DEFAULT_KEYBINDS,
  PIRATE_DURATION_MS,
  RARITIES,
  WEAPON_DEFS,
} from './constants';
import type { GunDef, ObstacleBox } from './types';

test('getTerrainHeight drops below sea level outside island rim and carves Crystal River + POIs', () => {
  const center = getTerrainHeight(0, 0);
  const lake = getTerrainHeight(-10, -165);
  const ocean = getTerrainHeight(375, 375);

  assert.ok(center > 0, 'Center island terrain should be above water');
  assert.ok(lake < 0, 'Crystal Lake should dip below water level');
  assert.ok(ocean < -2, 'Far corner should be deep ocean');
});

test('resolveObstacleCollision pushes player cleanly outside walls while permitting walking under and atop roofs', () => {
  const wallAndRoof: ObstacleBox[] = [
    { x: 10, z: 10, hw: 2, hd: 2, minY: 0, maxY: 8 },
    { x: 30, z: 30, hw: 4, hd: 4, minY: 7, maxY: 8.5, walkable: true },
  ];
  const res = resolveObstacleCollision(11.8, 10.2, 1.0, wallAndRoof, 380, 0.58);
  assert.ok(res.x >= 12.57, `Expected pushed outside right wall (>= 12.58), got ${res.x}`);

  const underRoof = resolveObstacleCollision(30, 30, 3.2, wallAndRoof, 380, 0.58);
  assert.equal(underRoof.x, 30);

  const roofSupport = getWalkableSurfaceY(30, 30, 8.6, wallAndRoof);
  assert.equal(roofSupport, 8.5);

  const ceilingCap = getCeilingLimitY(30, 30, 3.2, 1.85, wallAndRoof);
  assert.equal(ceilingCap, 7 - 1.85);
});

test('sloped ramp obstacle smoothly elevates walkable surface and permits climbing without snagging', () => {
  const ramp: ObstacleBox[] = [
    {
      x: 0,
      z: 0,
      hw: 2,
      hd: 2,
      minY: 10,
      maxY: 13.2,
      walkable: true,
      slope: { axis: 'z', dir: -1, lowY: 10, highY: 13.2 },
    },
  ];
  const midY = getWalkableSurfaceY(0, 0, 11.4, ramp);
  assert.ok(Math.abs(midY - 11.6) < 0.01);

  const topY = getWalkableSurfaceY(0, -1.95, 13.0, ramp);
  assert.ok(topY > 13.0 && topY <= 13.21);

  const climb = resolveObstacleCollision(0, 0.5, 11.1, ramp, 380, 0.58);
  assert.equal(climb.x, 0);
  assert.equal(climb.z, 0.5);
});

test('buffed AR (19 body / 26 head), Pump Shotgun (108 body / up to 178 head), and Tactical Pickaxe (25 dmg) match stats', () => {
  assert.equal(pickRandomRarity(() => 0.0).id, 'common');
  assert.equal(pickRandomRarity(() => 0.99).id, 'legendary');

  const arCommon = makeWeaponItem('ar', RARITIES[0]);
  const arDef = WEAPON_DEFS.ar as GunDef;
  assert.equal(Math.round(arCommon.damage!), 19);
  assert.equal(Math.round(arCommon.damage! * arDef.headMult), 26);

  const pumpCommon = makeWeaponItem('pump', RARITIES[0]);
  const pumpDef = WEAPON_DEFS.pump as GunDef;
  const pumpFivePelletBody = Math.round(pumpCommon.damage! * 5);
  const pumpFullBody = Math.round(pumpCommon.damage! * pumpDef.pellets);
  const pumpFullHeadshot = Math.round(pumpCommon.damage! * pumpDef.pellets * pumpDef.headMult);
  assert.equal(pumpFivePelletBody, 68);
  assert.equal(pumpFullBody, 108);
  assert.equal(pumpFullHeadshot, 178);

  const tacCommon = makeWeaponItem('tac', RARITIES[0]);
  const tacDef = WEAPON_DEFS.tac as GunDef;
  assert.equal(Math.round(tacCommon.damage! * tacDef.pellets), 84);

  const pickaxe = makeWeaponItem('pickaxe');
  assert.equal(pickaxe.def.type, 'melee');
  assert.equal(pickaxe.damage, 25);
});

test('pickChestWeaponId favors ARs and Shotguns (~89%) while keeping SMG low and Bolt Sniper rare (~3%)', () => {
  assert.equal(pickChestWeaponId(() => 0.10, true), 'ar');
  assert.equal(pickChestWeaponId(() => 0.50, true), 'pump');
  assert.equal(pickChestWeaponId(() => 0.75, true), 'tac');
  assert.equal(pickChestWeaponId(() => 0.92, true), 'smg');
  assert.equal(pickChestWeaponId(() => 0.985, true), 'sniper');

  // Empirical distribution check over 10,000 samples (deterministic LCG)
  let seed = 42;
  const nextRng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const counts: Record<string, number> = { ar: 0, pump: 0, tac: 0, smg: 0, sniper: 0 };
  for (let i = 0; i < 10000; i++) {
    counts[pickChestWeaponId(nextRng, true)]++;
  }
  assert.ok(counts.ar > 4100, `Expected ARs >41%, got ${counts.ar}`);
  assert.ok(counts.pump + counts.tac > 4000, `Expected Shotguns >40%, got ${counts.pump + counts.tac}`);
  assert.ok(counts.smg < 1100, `Expected SMG <11%, got ${counts.smg}`);
  assert.ok(counts.sniper < 450, `Expected Bolt Sniper rare (<4.5%), got ${counts.sniper}`);
});

test('pickChestHealDrop leaves ~70% of chests without heals and makes Medkits, Minis, Big Pots, and Chug Jugs rare', () => {
  assert.equal(pickChestHealDrop(() => 0.40, false), null);
  assert.equal(pickChestHealDrop(() => 0.75, false), 'mini');
  assert.equal(pickChestHealDrop(() => 0.88, false), 'medkit');
  assert.equal(pickChestHealDrop(() => 0.95, false), 'big');
  assert.equal(pickChestHealDrop(() => 0.985, false), 'chug');
  assert.equal(pickChestHealDrop(() => 0.985, true), null);

  let seed = 1337;
  const nextRng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const counts: Record<string, number> = { none: 0, mini: 0, medkit: 0, big: 0, chug: 0 };
  let prevChug = false;
  for (let i = 0; i < 10000; i++) {
    const h = pickChestHealDrop(nextRng, prevChug);
    counts[h ?? 'none']++;
    prevChug = h === 'chug';
  }
  assert.ok(counts.none > 6700, `Expected >=67% chests with NO heal, got ${counts.none}`);
  assert.ok(counts.mini < 1800, `Expected Minis rare (<18%), got ${counts.mini}`);
  assert.ok(counts.medkit < 950, `Expected Medkits rare (<9.5%), got ${counts.medkit}`);
  assert.ok(counts.big < 700, `Expected Big Pots rare (<7%), got ${counts.big}`);
  assert.ok(counts.chug < 400, `Expected Chug Jugs very rare (<4%), got ${counts.chug}`);
});

test('pickChestHealId makes Big Pots and Chug Jugs rare and prevents back-to-back Chug Jugs', () => {
  assert.equal(pickChestHealId(() => 0.25, false), 'mini');
  assert.equal(pickChestHealId(() => 0.70, false), 'medkit');
  assert.equal(pickChestHealId(() => 0.90, false), 'big');
  assert.equal(pickChestHealId(() => 0.98, false), 'chug');
  assert.equal(pickChestHealId(() => 0.98, true), 'mini');

  let seed = 2027;
  const nextRng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const counts: Record<string, number> = { mini: 0, medkit: 0, big: 0, chug: 0 };
  let prevChug = false;
  for (let i = 0; i < 10000; i++) {
    const h = pickChestHealId(nextRng, prevChug);
    counts[h]++;
    prevChug = h === 'chug';
  }
  assert.ok(counts.mini > 5300, `Expected Minis >53%, got ${counts.mini}`);
  assert.ok(counts.medkit < 2600, `Expected Medkits <26%, got ${counts.medkit}`);
  assert.ok(counts.big < 1700, `Expected Big Pots <17%, got ${counts.big}`);
  assert.ok(counts.chug < 800, `Expected Chug Jugs rare (<8%), got ${counts.chug}`);
});

test('pickFloorLootDrop spawns ground weapons, standalone ammo packs, and rare heals', () => {
  const gunDrop = pickFloorLootDrop(() => 0.15, false);
  assert.equal(gunDrop.kind, 'gun');
  if (gunDrop.kind === 'gun') {
    assert.ok(gunDrop.ammoAmount > 0);
  }
  const ammoDrop = pickFloorLootDrop(() => 0.75, false);
  assert.equal(ammoDrop.kind, 'ammo');
  if (ammoDrop.kind === 'ammo') {
    assert.ok(ammoDrop.ammoAmount > 0);
  }
  const healDrop = pickFloorLootDrop(() => 0.93, false);
  assert.equal(healDrop.kind, 'heal');
});

test('computeReloadTransfer enforces finite reserve ammo instead of infinite reloads', () => {
  const dry = computeReloadTransfer(0, 30, 0);
  assert.equal(dry.loaded, 0);
  assert.equal(dry.nextMag, 0);
  assert.equal(dry.nextReserve, 0);

  const partial = computeReloadTransfer(12, 30, 8);
  assert.equal(partial.loaded, 8);
  assert.equal(partial.nextMag, 20);
  assert.equal(partial.nextReserve, 0);

  const full = computeReloadTransfer(10, 30, 45);
  assert.equal(full.loaded, 20);
  assert.equal(full.nextMag, 30);
  assert.equal(full.nextReserve, 25);
});

test('pickupWithDrop fills empty slots first and drops replaced item when full, while backpack swap & drop preserve items', () => {
  const ar = makeWeaponItem('ar', RARITIES[0]);
  const pump = makeWeaponItem('pump', RARITIES[1]);
  const smg = makeWeaponItem('smg', RARITIES[2]);
  const sniper = makeWeaponItem('sniper', RARITIES[3]);
  const mini = makeWeaponItem('mini');
  const chug = makeWeaponItem('chug');

  const r1 = pickupWithDrop([ar, null, null, null, null], 0, pump);
  assert.equal(r1.nextActiveSlot, 1);
  assert.equal(r1.droppedItem, null);

  const fullSlots = [ar, pump, smg, sniper, mini];
  const r2 = pickupWithDrop(fullSlots, 2, chug);
  assert.equal(r2.nextActiveSlot, 2);
  assert.equal(r2.nextSlots[2]?.def.id, 'chug');
  assert.equal(r2.droppedItem?.def.id, 'smg');

  const swapped = swapBackpackSlots(fullSlots, 0, 3);
  assert.equal(swapped[0]?.def.id, 'sniper');
  assert.equal(swapped[3]?.def.id, 'ar');

  const dropped = dropBackpackSlot(swapped, 1);
  assert.equal(dropped.droppedItem?.def.id, 'pump');
  assert.equal(dropped.nextSlots[1], null);
});

test('chooseBotWeapon keeps Noob bots locked to primary while Pro bots switch AR at range and Shotgun up close', () => {
  assert.equal(chooseBotWeapon('noob', 6, true, true), 'primary');
  assert.equal(chooseBotWeapon('noob', 45, true, true), 'primary');

  assert.equal(chooseBotWeapon('pro', 8, true, true), 'shotgun');
  assert.equal(chooseBotWeapon('pro', 35, true, true), 'ar');
  assert.equal(chooseBotWeapon('pro', 18, true, true, 0.2), 'ar');
  assert.equal(chooseBotWeapon('pro', 18, true, true, 0.8), 'shotgun');
});

test('computeStormAudioParams scales storm sound intensity and stereo pan cleanly', () => {
  const storm = { cx: 0, cz: 0, radius: 100, targetRadius: 45, phaseTimer: 60, shrinkRate: 3 };
  const safeCenter = computeStormAudioParams(0, 0, 0, storm);
  assert.equal(safeCenter.insideStorm, false);
  assert.equal(safeCenter.intensity, 0);

  const nearWall = computeStormAudioParams(85, 0, 0, storm);
  assert.equal(nearWall.insideStorm, false);
  assert.ok(nearWall.intensity > 0.1);
  assert.ok(nearWall.pan > 0.8, 'Storm wall to player +X right should pan right');

  const deepInStorm = computeStormAudioParams(140, 0, 0, storm);
  assert.equal(deepInStorm.insideStorm, true);
  assert.ok(deepInStorm.intensity > nearWall.intensity);
});

test('getBattleBusPose interpolates position and heading across the island', () => {
  const start = getBattleBusPose(-300, -240, 300, 240, 0);
  const mid = getBattleBusPose(-300, -240, 300, 240, 0.5);
  assert.equal(start.x, -300);
  assert.equal(start.y, BUS_CRUISE_Y);
  assert.equal(mid.x, 0);
  assert.equal(mid.z, 0);
});

test('computeHealApplication handles Chug Jug full HP + Shield restore', () => {
  const chugDef = WEAPON_DEFS.chug;
  assert.equal(chugDef.type, 'heal');
  const res = computeHealApplication(24, 15, chugDef.healType, chugDef.amount, chugDef.maxCap);
  assert.equal(res.hp, 100);
  assert.equal(res.shield, 100);
});

test('computeDamageApplication drains shield before HP and flags shield break and elimination', () => {
  const r1 = computeDamageApplication(100, 50, 30);
  assert.equal(r1.shield, 20);
  assert.equal(r1.hp, 100);
  assert.equal(r1.shieldBroken, false);
  assert.equal(r1.eliminated, false);

  const r2 = computeDamageApplication(100, 20, 45);
  assert.equal(r2.shield, 0);
  assert.equal(r2.hp, 75);
  assert.equal(r2.shieldBroken, true);
  assert.equal(r2.eliminated, false);

  const r3 = computeDamageApplication(30, 0, 50);
  assert.equal(r3.hp, 0);
  assert.equal(r3.eliminated, true);
});

test('stepStorm shrinks radius toward targetRadius and detects storm exposure', () => {
  const s0 = { cx: 0, cz: 0, radius: 100, targetRadius: 45, phaseTimer: 60, shrinkRate: 5 };
  const s1 = stepStorm(s0, 2);
  assert.equal(s1.radius, 90);
  assert.equal(s1.phaseTimer, 58);
  assert.equal(isInsideStorm(0, 0, s1), false);
  assert.equal(isInsideStorm(95, 0, s1), true);
});

test('rollPirateToken grants unlimited access until 24H timer expires and prevents duplicate chest spam while active', () => {
  const now = 1_000_000;
  const hit = rollPirateToken(now, () => 0.05, false);
  assert.equal(hit.granted, true);
  assert.equal(hit.expiresAt, now + PIRATE_DURATION_MS);
  assert.equal(isPirateTokenActive(hit.expiresAt, now + 1000), true);
  assert.equal(isPirateTokenActive(hit.expiresAt, now + PIRATE_DURATION_MS - 100), true);
  assert.equal(isPirateTokenActive(hit.expiresAt, now + PIRATE_DURATION_MS + 1), false);

  const duplicate = rollPirateToken(now, () => 0.01, true);
  assert.equal(duplicate.granted, false);
});

test('getCurrentPoiName identifies POIs and wilderness fallback', () => {
  assert.equal(getCurrentPoiName(-140, -30), 'TILTED TOWERS');
  assert.equal(getCurrentPoiName(-230, 165), 'PIRATE COVE');
  assert.equal(getCurrentPoiName(300, -300), 'ISLAND WILDERNESS');
});

test('segmentToPointDistSq and swept-sphere hits register fast projectiles accurately', () => {
  const hit = segmentToPointDistSq(0, 1.5, 0, 0, 1.5, -20, 0.3, 1.5, -10);
  assert.ok(hit.distSq < 0.1);
  assert.ok(Math.abs(hit.t - 0.5) < 0.01);

  const headHit = sweptSphereSegmentHit(0, 2.0, 0, 0, 2.0, -60, 0.25, 2.0, -30, 0.5);
  assert.equal(headHit.hit, true);

  const capHit = sweptSphereCapsuleHit(0, 1.1, 0, 0, 1.1, -60, 0.4, 0, -45, 0.35, 1.75, 0.75);
  assert.equal(capHit.hit, true);

  const capMiss = sweptSphereCapsuleHit(0, 1.1, 0, 0, 1.1, -60, 3.0, 0, -45, 0.35, 1.75, 0.75);
  assert.equal(capMiss.hit, false);
});

test('computeBotLeadPoint leads moving targets proportionally to travel time', () => {
  const lead = computeBotLeadPoint(0, 0, 0, 1, -100, 12, 0, 200, 1.0);
  assert.ok(Math.abs(lead.x - 6.0) < 0.01);
  assert.equal(lead.z, -100);
});

test('pickupForBot fills up to 5 slots and upgrades lower-rarity duplicates', () => {
  let slots = [null, null, null, null, null] as Array<ReturnType<typeof makeWeaponItem> | null>;
  const items = [
    makeWeaponItem('ar', RARITIES[0]),
    makeWeaponItem('pump', RARITIES[1]),
    makeWeaponItem('smg', RARITIES[0]),
    makeWeaponItem('sniper', RARITIES[2]),
    makeWeaponItem('mini'),
  ];
  for (const it of items) {
    const res = pickupForBot(slots, it);
    assert.equal(res.pickedUp, true);
    slots = res.nextSlots;
  }
  assert.equal(slots.filter(Boolean).length, 5);

  const legAr = makeWeaponItem('ar', RARITIES[4]);
  const upgrade = pickupForBot(slots, legAr);
  assert.equal(upgrade.pickedUp, true);
  assert.equal(upgrade.nextSlots[0]?.rarity.id, 'legendary');
});

test('chooseBestBotSlot picks pickaxe when empty, switches by range across 5 slots, and heals when safe', () => {
  const empty = chooseBestBotSlot([null, null, null, null, null], 'pro', 12, 100, 0);
  assert.equal(empty.mode, 'pickaxe');

  const fullKit = [
    makeWeaponItem('ar', RARITIES[2]),
    makeWeaponItem('pump', RARITIES[2]),
    makeWeaponItem('sniper', RARITIES[3]),
    makeWeaponItem('smg', RARITIES[1]),
    makeWeaponItem('big'),
  ];

  const closeChoice = chooseBestBotSlot(fullKit, 'pro', 9, 100, 50);
  assert.equal(closeChoice.mode, 'gun');
  assert.equal(closeChoice.slotIdx, 1);

  const longChoice = chooseBestBotSlot(fullKit, 'pro', 85, 100, 50);
  assert.equal(longChoice.mode, 'gun');
  assert.equal(longChoice.slotIdx, 2);

  const midChoice = chooseBestBotSlot(fullKit, 'veteran', 40, 100, 50);
  assert.equal(midChoice.mode, 'gun');
  assert.equal(midChoice.slotIdx, 0);

  const healChoice = chooseBestBotSlot(fullKit, 'pro', 35, 42, 0);
  assert.equal(healChoice.mode, 'heal');
  assert.equal(healChoice.slotIdx, 4);

  const noobLocked = chooseBestBotSlot(fullKit, 'noob', 9, 100, 50);
  assert.equal(noobLocked.slotIdx, 0);

  // If all carried guns are dry (0 mag and 0 reserve), bot falls back to pickaxe
  const dryAr = { ...makeWeaponItem('ar', RARITIES[1]), ammo: 0 };
  const dryChoice = chooseBestBotSlot([dryAr, null, null, null, null], 'pro', 15, 100, 0, 0.5, createEmptyAmmoBag());
  assert.equal(dryChoice.mode, 'pickaxe');
});

test('resolveBotBuildingWaypoint routes bots cleanly around walls through front doorway and back out', () => {
  const b = {
    minX: -7,
    maxX: 7,
    minZ: -7,
    maxZ: 7,
    doorX: 0,
    doorZ: 9.6,
    thresholdZ: 7,
  };
  // Behind building aiming at interior chest (-3, -2) -> first clears back corner horizontally
  const wp1 = resolveBotBuildingWaypoint(2, -12, -3, -2, [b]);
  assert.ok(wp1.x < -8 || wp1.x > 8);
  assert.ok(wp1.z <= -9);

  // Beside building -> walks forward past front line
  const wp2 = resolveBotBuildingWaypoint(9.5, -1, -3, -2, [b]);
  assert.ok(wp2.z >= b.doorZ);

  // Front porch aligned with doorway -> enters doorway threshold
  const wp3 = resolveBotBuildingWaypoint(0.2, 9.5, -3, -2, [b]);
  assert.equal(wp3.x, b.doorX);
  assert.ok(wp3.z < b.thresholdZ);

  // Inside building aiming for outside target -> exits toward doorway first
  const wp4 = resolveBotBuildingWaypoint(-4, -3, 25, -20, [b]);
  assert.equal(wp4.x, b.doorX);
});

test('rebalanced RARITIES and pickBotRarity keep Epic+Legendary scarce so bots rarely drop high-tier guns', () => {
  let seed = 9001;
  const nextRng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let chestHighTier = 0;
  let vetHighTier = 0;
  let noobHighTier = 0;
  for (let i = 0; i < 5000; i++) {
    const rChest = pickRandomRarity(nextRng);
    if (rChest.id === 'epic' || rChest.id === 'legendary') chestHighTier++;
    const rVet = pickBotRarity('veteran', nextRng);
    if (rVet.id === 'epic' || rVet.id === 'legendary') vetHighTier++;
    const rNoob = pickBotRarity('noob', nextRng);
    if (rNoob.id === 'epic' || rNoob.id === 'legendary') noobHighTier++;
  }
  assert.ok(chestHighTier < 400, `Expected chest Epic+Legendary < 8% (<400/5000), got ${chestHighTier}`);
  assert.ok(vetHighTier < 225, `Expected veteran bot Epic+Legendary < 4.5%, got ${vetHighTier}`);
  assert.equal(noobHighTier, 0, 'Noob bots should never roll Epic/Legendary natively');
});

test('getRankFromRp and computeRankedRpDelta advance Bronze through Unreal accurately', () => {
  const b3 = getRankFromRp(350);
  assert.equal(b3.current.name, 'Bronze III');
  assert.equal(b3.next?.name, 'Silver I');

  const unreal = getRankFromRp(5600);
  assert.equal(unreal.current.name, 'Unreal');
  assert.equal(unreal.next, null);

  const winGain = computeRankedRpDelta(1, 5, 350);
  assert.ok(winGain.delta > 150, `Expected strong RP gain on Victory + 5 elims, got ${winGain.delta}`);

  const earlyDeathHighRank = computeRankedRpDelta(24, 0, 4600);
  assert.ok(earlyDeathHighRank.delta < 0, 'Early elimination in Champion should lose RP');
});

test('getBotSkillDistribution, getBotCombatProfile, and shouldBotPunishHeal scale cleanly from Easy to Extreme & Ranked', () => {
  const easyDist = getBotSkillDistribution(24, 'battle_royale', 'easy');
  const extremeDist = getBotSkillDistribution(24, 'battle_royale', 'extreme');
  assert.ok(easyDist.noob > extremeDist.noob);
  assert.ok(extremeDist.pro > easyDist.pro);
  assert.equal(easyDist.noob + easyDist.veteran + easyDist.pro, 24);
  assert.equal(extremeDist.noob + extremeDist.veteran + extremeDist.pro, 24);

  const easyProf = getBotCombatProfile('battle_royale', 'easy');
  const hardProf = getBotCombatProfile('battle_royale', 'hard');
  const extremeProf = getBotCombatProfile('battle_royale', 'extreme');
  const unrealProf = getBotCombatProfile('ranked', 'normal', 5200);

  assert.ok(extremeProf.acquireMax < hardProf.acquireMax && hardProf.acquireMax < easyProf.acquireMax);
  assert.ok(extremeProf.burstMax > easyProf.burstMax);
  assert.ok(extremeProf.cadenceMult < easyProf.cadenceMult);
  assert.ok(unrealProf.effectiveLevel > 0.95);

  assert.equal(shouldBotPunishHeal(2.0, 28, true, 55), true);
  assert.equal(shouldBotPunishHeal(0, 28, true, 55), false);
  assert.equal(shouldBotPunishHeal(2.0, 70, true, 55), false);
  assert.equal(shouldBotPunishHeal(2.0, 28, false, 55), false);
});

test('broken obstacles stop blocking movement, walking surfaces, and ceilings', () => {
  const brokenWall: ObstacleBox[] = [
    { x: 10, z: 10, hw: 2, hd: 2, minY: 0, maxY: 8, walkable: true, broken: true },
  ];
  const passThrough = resolveObstacleCollision(10.5, 10.2, 1.0, brokenWall, 380, 0.58);
  assert.equal(passThrough.x, 10.5);
  assert.equal(passThrough.z, 10.2);

  const surface = getWalkableSurfaceY(10, 10, 8.2, brokenWall);
  assert.ok(surface < 7.5, 'Broken upper roof should not support player weight');

  const ceil = getCeilingLimitY(10, 10, 1.0, 1.85, brokenWall);
  assert.equal(ceil, Infinity);
});

test('stepChestSearchProgress requires full 0.5-second channel and cancels on distance or interruption', () => {
  assert.equal(CHEST_OPEN_TIME, 0.5);
  const s1 = stepChestSearchProgress(0, 0.25, 2.0, 5.2, false);
  assert.equal(s1.completed, false);
  assert.equal(s1.canceled, false);
  assert.equal(s1.pct, 50);

  const s2 = stepChestSearchProgress(s1.elapsed, 0.25, 2.0, 5.2, false);
  assert.equal(s2.completed, true);
  assert.equal(s2.pct, 100);

  const outOfRange = stepChestSearchProgress(0.25, 0.1, 6.4, 5.2, false);
  assert.equal(outOfRange.canceled, true);
  assert.equal(outOfRange.elapsed, 0);

  const interrupted = stepChestSearchProgress(0.25, 0.1, 2.0, 5.2, true);
  assert.equal(interrupted.canceled, true);
});

test('applyStructureDamage grants pickaxe 2x bonus damage and breaks buildings cleanly', () => {
  const hit1 = applyStructureDamage(100, 25, true);
  assert.equal(hit1.nextHp, 50);
  assert.equal(hit1.broken, false);

  const hit2 = applyStructureDamage(hit1.nextHp, 25, true);
  assert.equal(hit2.nextHp, 0);
  assert.equal(hit2.broken, true);

  const gunHit = applyStructureDamage(100, 19, false);
  assert.equal(gunHit.nextHp, 81);
  assert.equal(gunHit.broken, false);
});

test('assignBotSquads, areBotsTeammates, shouldBotBroadcastPing, and computeBotFlankWaypoint support tactical squads', () => {
  const squads = assignBotSquads(24, 3);
  assert.equal(squads.length, 24);
  assert.equal(areBotsTeammates(squads[0], squads[2]), true);
  assert.equal(areBotsTeammates(squads[0], squads[3]), false);

  assert.equal(shouldBotBroadcastPing(0, true, true), true);
  assert.equal(shouldBotBroadcastPing(2.5, true, true), false);
  assert.equal(shouldBotBroadcastPing(0, false, true), false);

  const leftFlank = computeBotFlankWaypoint(0, 20, 0, 0, 1, 15, 1.0);
  const rightFlank = computeBotFlankWaypoint(0, 20, 0, 0, -1, 15, 1.0);
  assert.ok(Math.abs(Math.hypot(leftFlank.x, leftFlank.z) - 15) < 0.01);
  assert.ok(leftFlank.x < -10 && rightFlank.x > 10);
});

test('party code generation, normalization, sanitization, and friendly fire checks enforce multiplayer rules', () => {
  assert.equal(getTeamSizeForMode('solo'), 1);
  assert.equal(getTeamSizeForMode('duos'), 2);
  assert.equal(getTeamSizeForMode('trios'), 3);
  assert.equal(getTeamSizeForMode('squads'), 4);

  assert.equal(sanitizePlayerName('  <Script>Hero_99!!  '), 'ScriptHero_99');
  assert.equal(sanitizePlayerName('   ', 'DefaultAgent'), 'DefaultAgent');
  assert.equal(normalizePartyCode('fbx 7k2m'), 'FBX-7K2M');
  assert.equal(normalizePartyCode('9a2b'), 'FBX-9A2B');

  const code = generatePartyCode(() => 0);
  assert.match(code, /^FBX-[A-Z2-9]{4}$/);

  assert.equal(isFriendlyTarget(0, 0), true);
  assert.equal(isFriendlyTarget(0, 1), false);
  assert.equal(isFriendlyTarget(-1, -1), false);
});

test('assignMatchTeams groups party humans on teamId 0, fills remaining slots with AI allies, and computes alive teams', () => {
  const duoRoster = assignMatchTeams({
    humanMembers: [
      { id: 'p1', name: 'Alpha', skinId: 'recruit', emoteId: 'boogie' },
      { id: 'p2', name: 'Bravo', skinId: 'neon', emoteId: 'floss' },
    ],
    teamMode: 'duos',
    fillTeammates: true,
    totalPlayers: 25,
    seed: 777,
  });

  assert.equal(duoRoster.length, 25);
  const p1 = duoRoster.find((p) => p.id === 'p1')!;
  const p2 = duoRoster.find((p) => p.id === 'p2')!;
  assert.equal(p1.teamId, 0);
  assert.equal(p2.teamId, 0);
  assert.equal(p1.isHuman, true);
  assert.equal(p2.isHuman, true);
  // Duos is full with 2 humans so no bot-ally needed on team 0
  assert.equal(duoRoster.filter((p) => p.teamId === 0).length, 2);

  // Solo player queueing Duos with Fill=true gets 1 AI ally on team 0
  const soloFillDuo = assignMatchTeams({
    humanMembers: [{ id: 'p1', name: 'SoloPlayer', skinId: 'recruit', emoteId: 'boogie' }],
    teamMode: 'duos',
    fillTeammates: true,
    totalPlayers: 25,
    seed: 888,
  });
  const team0 = soloFillDuo.filter((p) => p.teamId === 0);
  assert.equal(team0.length, 2);
  assert.equal(team0.some((m) => !m.isHuman), true);

  // Trios with 1 human & Fill=false stays size 1 on team 0
  const noFillTrios = assignMatchTeams({
    humanMembers: [{ id: 'p1', name: 'NoFill', skinId: 'recruit', emoteId: 'boogie' }],
    teamMode: 'trios',
    fillTeammates: false,
    totalPlayers: 25,
    seed: 999,
  });
  assert.equal(noFillTrios.filter((p) => p.teamId === 0).length, 1);

  assert.equal(
    computeAliveTeamsCount([
      { teamId: 0, alive: true },
      { teamId: 0, alive: false },
      { teamId: 1, alive: false },
      { teamId: 2, alive: true },
    ]),
    2,
  );

  const rA = seededRng(12345);
  const rB = seededRng(12345);
  assert.equal(rA(), rB());
  assert.equal(rA(), rB());
});

test('keybind helpers format codes cleanly and swap conflicting bindings without collisions', () => {
  assert.equal(formatKeyCodeLabel('KeyW'), 'W');
  assert.equal(formatKeyCodeLabel('Digit4'), '4');
  assert.equal(formatKeyCodeLabel('Space'), 'SPACE');
  assert.equal(formatKeyCodeLabel('ShiftLeft'), 'SHIFT');

  const swapped = updateKeybind(DEFAULT_KEYBINDS, 'reload', 'KeyE');
  assert.equal(swapped.reload, 'KeyE');
  assert.equal(swapped.interact, 'KeyR');
});

test('computeShotgunPelletSpreadOffsets places center pellet near reticle and tightens ring when aiming', () => {
  const hip = computeShotgunPelletSpreadOffsets(8, 0.032, false, () => 0.5);
  const ads = computeShotgunPelletSpreadOffsets(8, 0.032, true, () => 0.5);
  assert.equal(hip.length, 8);
  assert.equal(ads.length, 8);
  assert.ok(Math.hypot(hip[0].right, hip[0].up) < 0.004);
  const hipRing = Math.hypot(hip[1].right, hip[1].up);
  const adsRing = Math.hypot(ads[1].right, ads[1].up);
  assert.ok(adsRing < hipRing);
});

test('DBNO, squad wipe, bleedout, revive, and reboot rules follow Fortnite squad mechanics', () => {
  const trioState = [
    { id: 'h1', teamId: 0, alive: true, knocked: false },
    { id: 'h2', teamId: 0, alive: true, knocked: true },
    { id: 'h3', teamId: 0, alive: true, knocked: false },
    { id: 'e1', teamId: 1, alive: true, knocked: false },
  ];
  assert.equal(shouldEnterDbno(0, 'h1', trioState), true);
  assert.equal(shouldEnterDbno(1, 'e1', trioState), false);

  // If h3 goes down while h1 is standing, h2 stays knocked (not squad-wiped yet)
  assert.deepEqual(findSquadWipeTargets(0, 'h3', trioState), []);

  // If h1 goes down while h3 is already eliminated/knocked -> squad wipe h2
  const twoKnocked = [
    { id: 'h1', teamId: 0, alive: true, knocked: false },
    { id: 'h2', teamId: 0, alive: true, knocked: true },
    { id: 'h3', teamId: 0, alive: false, knocked: false },
  ];
  assert.deepEqual(findSquadWipeTargets(0, 'h1', twoKnocked), ['h2']);

  // Bleedout pauses while reviving and drains otherwise
  const paused = stepDbnoBleed(50, 5, true, 2);
  assert.equal(paused.dbnoHp, 50);
  const bled = stepDbnoBleed(5, 3, false, 2);
  assert.equal(bled.dbnoHp, 0);
  assert.equal(bled.bledOut, true);

  const fin = applyDbnoDamage(40, 55);
  assert.equal(fin.eliminated, true);

  assert.deepEqual(computeReviveResult(), { hp: 30, shield: 0, knocked: false });
  assert.deepEqual(computeRebootResult(), { hp: 100, shield: 0, alive: true, knocked: false });
});



