import {
  AMMO_DEFS,
  BOT_COUNT,
  BOT_NAMES,
  BUS_CRUISE_Y,
  CHEST_OPEN_TIME,
  DBNO_BLEED_RATE,
  HALF_MAP,
  PIRATE_DURATION_MS,
  PIRATE_TOKEN_CHANCE,
  POIS,
  RANK_TIERS,
  RARITIES,
  SKINS,
  TEAM_MODE_DEFS,
  WEAPON_DEFS,
} from './constants';
import type {
  AmmoBag,
  AmmoType,
  BotDifficulty,
  BotSkillTier,
  BuildingNavVolume,
  EmoteId,
  InventoryItem,
  KeybindAction,
  KeybindsConfig,
  MatchMode,
  ObstacleBox,
  ObstacleSlope,
  RankTierDef,
  RarityDef,
  TeamMode,
  WeaponId,
} from './types';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getRiverCenterX(z: number): number {
  // Smooth winding river channel flowing from Crystal Lake (x=-10, z=-165) down to south coast (z=310)
  return -10 + Math.sin((z + 165) * 0.011) * 46 + ((z + 165) / 475) * 82;
}

export function getTerrainHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);
  const islandMask = Math.max(0, 1 - Math.pow(dist / (HALF_MAP * 0.92), 3.4));
  let h =
    Math.sin(x * 0.015) * Math.cos(z * 0.015) * 4.2 +
    Math.sin(x * 0.036 + z * 0.025) * 1.8 +
    3.6;

  // Carve winding river valley between Crystal Lake and southern shore (kept clear of Red Hangars & Salty)
  if (z > -155 && z < 325) {
    const rx = getRiverCenterX(z);
    const rd = Math.abs(x - rx);
    if (rd < 16) {
      const bankBlend = 1 - rd / 16;
      h = lerp(h, -1.35, Math.pow(bankBlend, 1.35) * 0.92);
    }
  }

  for (const poi of POIS) {
    const pd = Math.hypot(x - poi.x, z - poi.z);
    if (pd < poi.r) {
      const blend = Math.max(0, 1 - pd / poi.r);
      if (poi.type === 'lake') h = lerp(h, -1.6, blend * 0.85);
      else h = lerp(h, 3.2, blend * 0.9);
    }
  }
  return h * islandMask - (1 - islandMask) * 4.5;
}

export function getSlopeSurfaceY(x: number, z: number, ob: ObstacleBox, slope: ObstacleSlope): number {
  const halfSpan = slope.axis === 'x' ? ob.hw : ob.hd;
  const pos = slope.axis === 'x' ? x - ob.x : z - ob.z;
  const normalized = clamp((pos * slope.dir + halfSpan) / Math.max(0.001, halfSpan * 2), 0, 1);
  return lerp(slope.lowY, slope.highY, normalized);
}

export function resolveObstacleCollision(
  x: number,
  z: number,
  y: number,
  obstacles: ObstacleBox[],
  halfMap: number = HALF_MAP,
  radius = 0.58,
  playerHeight = 1.85,
): { x: number; z: number } {
  let nx = x;
  let nz = z;

  for (const ob of obstacles) {
    if (ob.broken) continue;
    if (ob.slope) {
      const insideXZ = Math.abs(nx - ob.x) <= ob.hw + radius && Math.abs(nz - ob.z) <= ob.hd + radius;
      if (insideXZ) {
        const rampY = getSlopeSurfaceY(nx, nz, ob, ob.slope);
        if (y >= rampY - 1.25 || y + playerHeight <= rampY - 0.15) {
          continue;
        }
      }
    }
    if (y + playerHeight <= ob.minY + 0.05 || y >= ob.maxY - 0.35) {
      continue;
    }
    const dx = nx - ob.x;
    const dz = nz - ob.z;
    const ox = ob.hw + radius - Math.abs(dx);
    const oz = ob.hd + radius - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) nx += dx > 0 ? ox : -ox;
      else nz += dz > 0 ? oz : -oz;
    }
  }

  nx = clamp(nx, -halfMap + 15, halfMap - 15);
  nz = clamp(nz, -halfMap + 15, halfMap - 15);
  return { x: nx, z: nz };
}

export function getWalkableSurfaceY(
  x: number,
  z: number,
  feetY: number,
  obstacles: ObstacleBox[],
  radius = 0.36,
): number {
  let bestY = getTerrainHeight(x, z);
  for (const ob of obstacles) {
    if (ob.broken || !ob.walkable) continue;
    if (Math.abs(x - ob.x) <= ob.hw + radius && Math.abs(z - ob.z) <= ob.hd + radius) {
      if (ob.slope) {
        const sy = getSlopeSurfaceY(x, z, ob, ob.slope);
        if (feetY >= sy - 1.25 && sy > bestY) {
          bestY = sy;
        }
      } else if (feetY >= ob.maxY - 0.65 && ob.maxY > bestY) {
        bestY = ob.maxY;
      }
    }
  }
  return bestY;
}

export function getCeilingLimitY(
  x: number,
  z: number,
  feetY: number,
  playerHeight: number,
  obstacles: ObstacleBox[],
  radius = 0.35,
): number {
  let ceilingY = Infinity;
  for (const ob of obstacles) {
    if (ob.broken) continue;
    if (Math.abs(x - ob.x) <= ob.hw + radius && Math.abs(z - ob.z) <= ob.hd + radius) {
      const effectiveMinY = ob.slope ? getSlopeSurfaceY(x, z, ob, ob.slope) - 0.15 : ob.minY;
      if (effectiveMinY >= feetY + 0.6 && effectiveMinY - playerHeight < ceilingY) {
        ceilingY = effectiveMinY - playerHeight;
      }
    }
  }
  return ceilingY;
}

export function pickRandomRarity(rng: () => number = Math.random): RarityDef {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let roll = rng() * total;
  for (const r of RARITIES) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return RARITIES[0];
}

export function pickBotRarity(tier: BotSkillTier, rng: () => number = Math.random): RarityDef {
  const r = rng();
  if (tier === 'noob') {
    // 68% Common, 26% Uncommon, 6% Rare (never spawns Epic/Legendary natively)
    if (r < 0.68) return RARITIES[0];
    if (r < 0.94) return RARITIES[1];
    return RARITIES[2];
  }
  if (tier === 'veteran') {
    // 52% Common, 30% Uncommon, 15% Rare, 2.5% Epic, 0.5% Legendary
    if (r < 0.52) return RARITIES[0];
    if (r < 0.82) return RARITIES[1];
    if (r < 0.97) return RARITIES[2];
    if (r < 0.995) return RARITIES[3];
    return RARITIES[4];
  }
  // Pro: 38% Common, 32% Uncommon, 22% Rare, 6% Epic, 2% Legendary
  if (r < 0.38) return RARITIES[0];
  if (r < 0.70) return RARITIES[1];
  if (r < 0.92) return RARITIES[2];
  if (r < 0.98) return RARITIES[3];
  return RARITIES[4];
}

export function pickChestWeaponId(rng: () => number = Math.random, allowSniper = true): WeaponId {
  const r = rng();
  if (allowSniper) {
    // 45% AR, 24% Pump Shotgun, 20% Tactical Shotgun, 8% SMG, 3% Bolt Sniper (rare)
    if (r < 0.45) return 'ar';
    if (r < 0.69) return 'pump';
    if (r < 0.89) return 'tac';
    if (r < 0.97) return 'smg';
    return 'sniper';
  }
  // Breakable crates: 45% AR, 26% Pump Shotgun, 21% Tactical Shotgun, 8% SMG
  if (r < 0.45) return 'ar';
  if (r < 0.71) return 'pump';
  if (r < 0.92) return 'tac';
  return 'smg';
}

export function pickChestHealDrop(
  rng: () => number = Math.random,
  prevWasChug = false,
): 'mini' | 'big' | 'medkit' | 'chug' | null {
  const r = rng();
  // Heals are NOT guaranteed in every chest: 70% none, 15% Mini Pot, 7% Medkit, 5% Big Pot, 3% Chug Jug
  if (r < 0.70) return null;
  if (r < 0.85) return 'mini';
  if (r < 0.92) return 'medkit';
  if (r < 0.97) return 'big';
  return prevWasChug ? null : 'chug';
}

export function pickChestHealId(
  rng: () => number = Math.random,
  prevWasChug = false,
): 'mini' | 'big' | 'medkit' | 'chug' {
  const r = rng();
  // Weighted heal picker when a heal item rolls: 58% Mini, 22% Medkit, 14% Big, 6% Chug
  if (r < 0.58) return 'mini';
  if (r < 0.80) return 'medkit';
  if (r < 0.94) return 'big';
  return prevWasChug ? 'mini' : 'chug';
}

export function pickFloorLootDrop(
  rng: () => number = Math.random,
  prevWasChug = false,
):
  | { kind: 'gun'; weaponId: WeaponId; ammoType: AmmoType; ammoAmount: number }
  | { kind: 'ammo'; ammoType: AmmoType; ammoAmount: number }
  | { kind: 'heal'; healId: 'mini' | 'big' | 'medkit' | 'chug' } {
  const roll = rng();
  if (roll < 0.64) {
    const weaponId = pickChestWeaponId(rng, true);
    const def = WEAPON_DEFS[weaponId];
    const ammoType = def.type === 'gun' ? def.ammoType : 'medium';
    return { kind: 'gun', weaponId, ammoType, ammoAmount: AMMO_DEFS[ammoType].stackSize };
  }
  if (roll < 0.88) {
    const aRoll = rng();
    const ammoType: AmmoType =
      aRoll < 0.42 ? 'medium' : aRoll < 0.78 ? 'shells' : aRoll < 0.92 ? 'light' : 'heavy';
    return { kind: 'ammo', ammoType, ammoAmount: AMMO_DEFS[ammoType].stackSize };
  }
  const hRoll = rng();
  const healId: 'mini' | 'big' | 'medkit' | 'chug' =
    hRoll < 0.62 ? 'mini' : hRoll < 0.84 ? 'medkit' : hRoll < 0.95 ? 'big' : prevWasChug ? 'mini' : 'chug';
  return { kind: 'heal', healId };
}

export function createEmptyAmmoBag(): AmmoBag {
  return { medium: 0, shells: 0, light: 0, heavy: 0 };
}

export function computeReloadTransfer(
  currentMag: number,
  magCap: number,
  reserveAmmo: number,
): { nextMag: number; nextReserve: number; loaded: number } {
  const safeMag = Math.max(0, Math.min(magCap, currentMag));
  const safeReserve = Math.max(0, reserveAmmo);
  const needed = Math.max(0, magCap - safeMag);
  const loaded = Math.min(needed, safeReserve);
  return {
    nextMag: safeMag + loaded,
    nextReserve: safeReserve - loaded,
    loaded,
  };
}

export function makeWeaponItem(weaponId: WeaponId, rarityObj?: RarityDef, rng: () => number = Math.random): InventoryItem {
  const def = WEAPON_DEFS[weaponId];
  if (def.type === 'melee') {
    return { def, rarity: RARITIES[2], damage: def.dmg };
  }
  if (def.type === 'heal') {
    return { def, rarity: RARITIES[weaponId === 'chug' ? 4 : weaponId === 'medkit' ? 2 : 1], count: 1 };
  }
  const rar = rarityObj || pickRandomRarity(rng);
  return {
    def,
    rarity: rar,
    ammo: def.mag,
    damage: def.dmg * rar.mult,
  };
}

export function pickupWithDrop(
  slots: Array<InventoryItem | null>,
  activeSlot: number,
  newItem: InventoryItem,
): {
  nextSlots: Array<InventoryItem | null>;
  nextActiveSlot: number;
  droppedItem: InventoryItem | null;
} {
  const nextSlots = [...slots];
  const emptyIdx = nextSlots.findIndex((s) => s === null);
  if (emptyIdx !== -1) {
    nextSlots[emptyIdx] = newItem;
    return { nextSlots, nextActiveSlot: emptyIdx, droppedItem: null };
  }
  const replaceIdx = activeSlot >= 0 && activeSlot < nextSlots.length ? activeSlot : 0;
  const droppedItem = nextSlots[replaceIdx];
  nextSlots[replaceIdx] = newItem;
  return { nextSlots, nextActiveSlot: replaceIdx, droppedItem };
}

export function swapBackpackSlots(
  slots: Array<InventoryItem | null>,
  idxA: number,
  idxB: number,
): Array<InventoryItem | null> {
  if (
    idxA < 0 ||
    idxB < 0 ||
    idxA >= slots.length ||
    idxB >= slots.length ||
    idxA === idxB
  ) {
    return [...slots];
  }
  const next = [...slots];
  const tmp = next[idxA];
  next[idxA] = next[idxB];
  next[idxB] = tmp;
  return next;
}

export function dropBackpackSlot(
  slots: Array<InventoryItem | null>,
  idx: number,
): { nextSlots: Array<InventoryItem | null>; droppedItem: InventoryItem | null } {
  if (idx < 0 || idx >= slots.length) {
    return { nextSlots: [...slots], droppedItem: null };
  }
  const nextSlots = [...slots];
  const droppedItem = nextSlots[idx];
  nextSlots[idx] = null;
  return { nextSlots, droppedItem };
}

export function computeHealApplication(
  currentHp: number,
  currentShield: number,
  healType: 'shield' | 'hp' | 'both',
  amount: number,
  maxCap: number,
): { hp: number; shield: number } {
  if (healType === 'both') {
    return {
      hp: Math.min(maxCap, currentHp + amount),
      shield: Math.min(maxCap, currentShield + amount),
    };
  }
  if (healType === 'shield') {
    return {
      hp: currentHp,
      shield: Math.min(maxCap, currentShield + amount),
    };
  }
  return {
    hp: Math.min(maxCap, currentHp + amount),
    shield: currentShield,
  };
}

export function computeDamageApplication(
  currentHp: number,
  currentShield: number,
  incomingDamage: number,
): {
  hp: number;
  shield: number;
  absorbedByShield: number;
  shieldBroken: boolean;
  eliminated: boolean;
} {
  let hp = currentHp;
  let shield = currentShield;
  let remaining = Math.max(0, incomingDamage);
  let absorbedByShield = 0;
  let shieldBroken = false;

  if (shield > 0) {
    absorbedByShield = Math.min(shield, remaining);
    shield -= absorbedByShield;
    remaining -= absorbedByShield;
    if (shield <= 0) {
      shield = 0;
      shieldBroken = true;
    }
  }

  hp = Math.max(0, hp - remaining);
  return {
    hp,
    shield,
    absorbedByShield,
    shieldBroken,
    eliminated: hp <= 0,
  };
}

export interface StormState {
  cx: number;
  cz: number;
  radius: number;
  targetRadius: number;
  phaseTimer: number;
  shrinkRate: number;
}

export function stepStorm(state: StormState, dt: number): StormState {
  const phaseTimer = Math.max(0, state.phaseTimer - dt);
  const radius =
    state.radius > state.targetRadius
      ? Math.max(state.targetRadius, state.radius - state.shrinkRate * dt)
      : state.radius;
  return {
    ...state,
    phaseTimer,
    radius,
  };
}

export function isInsideStorm(x: number, z: number, storm: StormState): boolean {
  return Math.hypot(x - storm.cx, z - storm.cz) > storm.radius;
}

export function computeStormAudioParams(
  px: number,
  pz: number,
  playerYaw: number,
  storm: StormState,
): {
  insideStorm: boolean;
  proximity: number;
  intensity: number;
  pan: number;
} {
  const dx = px - storm.cx;
  const dz = pz - storm.cz;
  const dist = Math.hypot(dx, dz);
  const signedDist = dist - storm.radius;
  const insideStorm = signedDist > 0;

  let intensity = 0;
  let proximity = 0;
  if (signedDist <= -45) {
    intensity = 0;
    proximity = 0;
  } else if (signedDist <= 0) {
    const nearNorm = (signedDist + 45) / 45;
    proximity = nearNorm * 0.45;
    intensity = Math.pow(nearNorm, 1.4) * 0.36;
  } else {
    const deepNorm = clamp(signedDist / 50, 0, 1);
    proximity = 0.45 + deepNorm * 0.55;
    intensity = 0.48 + deepNorm * 0.52;
  }

  let pan = 0;
  if (dist > 0.5) {
    // Outward vector toward storm wall; dot with player's right vector (cos(yaw), -sin(yaw))
    const nx = dx / dist;
    const nz = dz / dist;
    const rightX = Math.cos(playerYaw);
    const rightZ = -Math.sin(playerYaw);
    pan = clamp(nx * rightX + nz * rightZ, -0.95, 0.95);
    if (insideStorm) pan *= 0.35; // Surround feeling deeper inside the storm
  }

  return { insideStorm, proximity, intensity, pan };
}

export function chooseBotWeapon(
  tier: BotSkillTier,
  distToTarget: number,
  hasAr: boolean,
  hasShotgun: boolean,
  midRangeRoll = 0.5,
): 'primary' | 'ar' | 'shotgun' {
  if (tier === 'noob') {
    return 'primary';
  }
  if (tier === 'veteran') {
    if (distToTarget <= 13 && hasShotgun) return 'shotgun';
    if (hasAr) return 'ar';
    return 'primary';
  }
  // Pro bots use shotgun close, AR at long/mid range and sometimes close
  if (distToTarget <= 14 && hasShotgun) return 'shotgun';
  if (distToTarget <= 22 && hasShotgun && hasAr) {
    return midRangeRoll < 0.35 ? 'ar' : 'shotgun';
  }
  if (hasAr) return 'ar';
  return hasShotgun ? 'shotgun' : 'primary';
}

export function pickupForBot(
  slots: Array<InventoryItem | null>,
  newItem: InventoryItem,
): { nextSlots: Array<InventoryItem | null>; pickedUp: boolean; replacedItem: InventoryItem | null } {
  const nextSlots = [...slots];

  // Upgrade existing same-weapon gun if new loot has higher rarity
  if (newItem.def.type === 'gun') {
    const sameIdx = nextSlots.findIndex((s) => s !== null && s.def.id === newItem.def.id);
    if (sameIdx !== -1) {
      const existing = nextSlots[sameIdx]!;
      if (newItem.rarity.mult > existing.rarity.mult) {
        nextSlots[sameIdx] = newItem;
        return { nextSlots, pickedUp: true, replacedItem: existing };
      }
      // Already carries same or better copy; only take another if free slot and < 3 guns
      const emptyIdx = nextSlots.findIndex((s) => s === null);
      if (emptyIdx === -1) return { nextSlots, pickedUp: false, replacedItem: null };
    }
  }

  // Fill any open slot up to 5 slots
  const emptyIdx = nextSlots.findIndex((s) => s === null);
  if (emptyIdx !== -1) {
    nextSlots[emptyIdx] = newItem;
    return { nextSlots, pickedUp: true, replacedItem: null };
  }

  // Inventory is full (5/5): upgrade weaker-rarity gun or replace duplicate heal when grabbing a gun
  if (newItem.def.type === 'gun') {
    let worstGunIdx = -1;
    let worstMult = newItem.rarity.mult;
    for (let i = 0; i < nextSlots.length; i++) {
      const s = nextSlots[i];
      if (s && s.def.type === 'gun' && s.rarity.mult < worstMult) {
        worstMult = s.rarity.mult;
        worstGunIdx = i;
      }
    }
    if (worstGunIdx !== -1) {
      const replacedItem = nextSlots[worstGunIdx];
      nextSlots[worstGunIdx] = newItem;
      return { nextSlots, pickedUp: true, replacedItem };
    }

    // If holding >1 heal, swap a weaker heal for a gun
    const healIndices = nextSlots
      .map((s, idx) => ({ s, idx }))
      .filter((x) => x.s && x.s.def.type === 'heal');
    if (healIndices.length > 1) {
      const dropIdx = healIndices[0].idx;
      const replacedItem = nextSlots[dropIdx];
      nextSlots[dropIdx] = newItem;
      return { nextSlots, pickedUp: true, replacedItem };
    }
  }

  return { nextSlots, pickedUp: false, replacedItem: null };
}

export function chooseBestBotSlot(
  slots: Array<InventoryItem | null>,
  tier: BotSkillTier,
  distToTarget: number,
  hp: number,
  shield: number,
  midRoll = 0.5,
  ammoBag?: AmmoBag,
): { slotIdx: number; mode: 'gun' | 'heal' | 'pickaxe' } {
  // Check whether bot should pop a real heal from its 5-slot backpack when out of immediate point-blank danger
  if ((hp < 58 || (shield === 0 && hp < 86)) && distToTarget > 17) {
    let bestHealIdx = -1;
    let bestHealScore = -1;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s || s.def.type !== 'heal') continue;
      if (s.def.healType === 'shield' && shield >= s.def.maxCap) continue;
      if (s.def.healType === 'hp' && hp >= s.def.maxCap) continue;
      const score = s.def.id === 'chug' ? 4 : s.def.id === 'medkit' ? 3 : s.def.id === 'big' ? 2 : 1;
      if (score > bestHealScore) {
        bestHealScore = score;
        bestHealIdx = i;
      }
    }
    if (bestHealIdx !== -1 && (tier !== 'noob' || hp < 45)) {
      return { slotIdx: bestHealIdx, mode: 'heal' };
    }
  }

  // Collect all gun slots that still have ammo in mag or reserve
  const gunSlots: Array<{ idx: number; item: InventoryItem }> = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s || s.def.type !== 'gun') continue;
    if (ammoBag && (s.ammo ?? 0) <= 0 && (ammoBag[s.def.ammoType] ?? 0) <= 0) continue;
    gunSlots.push({ idx: i, item: s });
  }
  if (gunSlots.length === 0) {
    return { slotIdx: -1, mode: 'pickaxe' };
  }

  // Noob bots stay on their first gun without tactical range switching
  if (tier === 'noob') {
    return { slotIdx: gunSlots[0].idx, mode: 'gun' };
  }

  // Smart range-aware weapon scoring across all 5 slots
  let bestIdx = gunSlots[0].idx;
  let bestScore = -Infinity;
  for (const { idx, item } of gunSlots) {
    const id = item.def.id;
    let score = item.rarity.mult * 10;
    if (distToTarget <= 14.5) {
      // Close-quarters combat
      if (id === 'pump') score += 52;
      else if (id === 'tac') score += 48;
      else if (id === 'smg') score += 40;
      else if (id === 'ar') score += tier === 'pro' && midRoll < 0.25 ? 36 : 22;
      else if (id === 'sniper') score += 4;
    } else if (distToTarget <= 24) {
      // Transition mid-close range
      if (id === 'ar') score += tier === 'pro' && midRoll < 0.45 ? 50 : 40;
      else if (id === 'smg') score += 42;
      else if (id === 'tac' || id === 'pump') score += 44;
      else if (id === 'sniper') score += 14;
    } else if (distToTarget <= 62) {
      // Mid-range skirmish
      if (id === 'ar') score += 52;
      else if (id === 'smg') score += 36;
      else if (id === 'sniper') score += 34;
      else score += 10;
    } else {
      // Long-range engagement
      if (id === 'sniper') score += 58;
      else if (id === 'ar') score += 48;
      else if (id === 'smg') score += 20;
      else score += 4;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }
  return { slotIdx: bestIdx, mode: 'gun' };
}

export function getBattleBusPose(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  progress: number,
  cruiseY = BUS_CRUISE_Y,
): { x: number; y: number; z: number; yaw: number } {
  const t = clamp(progress, 0, 1);
  return {
    x: lerp(startX, endX, t),
    y: cruiseY,
    z: lerp(startZ, endZ, t),
    yaw: Math.atan2(endX - startX, endZ - startZ),
  };
}

export function getRankFromRp(rp: number): {
  current: RankTierDef;
  next: RankTierDef | null;
  tierIndex: number;
  progressPct: number;
  rpToNext: number;
} {
  const safeRp = Math.max(0, Math.round(rp));
  let idx = 0;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (safeRp >= RANK_TIERS[i].minRp) idx = i;
  }
  const current = RANK_TIERS[idx];
  const next = idx + 1 < RANK_TIERS.length ? RANK_TIERS[idx + 1] : null;
  if (!next) {
    return { current, next: null, tierIndex: idx, progressPct: 100, rpToNext: 0 };
  }
  const span = Math.max(1, next.minRp - current.minRp);
  const progressPct = clamp(((safeRp - current.minRp) / span) * 100, 0, 100);
  return {
    current,
    next,
    tierIndex: idx,
    progressPct,
    rpToNext: Math.max(0, next.minRp - safeRp),
  };
}

export function computeRankedRpDelta(
  placement: number,
  kills: number,
  currentRp: number,
): { delta: number; nextRp: number } {
  const { tierIndex } = getRankFromRp(currentRp);
  let placementBonus = 0;
  if (placement <= 1) placementBonus = 115;
  else if (placement <= 3) placementBonus = 70;
  else if (placement <= 5) placementBonus = 48;
  else if (placement <= 10) placementBonus = 26;
  else if (placement <= 15) placementBonus = 10;

  const elimBonus = Math.max(0, kills) * 18;
  const earlyBonus = placement <= 10 && kills > 0 ? Math.min(20, kills * 4) : 0;
  const busFare = Math.round(tierIndex * 3.8);

  const delta = placementBonus + elimBonus + earlyBonus - busFare;
  const nextRp = Math.max(0, Math.round(currentRp + delta));
  return { delta: nextRp - Math.round(currentRp), nextRp };
}

export interface BotCombatProfile {
  effectiveLevel: number;
  acquireMin: number;
  acquireMax: number;
  cadenceMult: number;
  burstMin: number;
  burstMax: number;
  spreadScale: number;
  dmgScale: number;
  strafeSwitchInterval: number;
  crouchSpamChance: number;
  jumpDodgeChance: number;
  slidePushChance: number;
  healPunishDist: number;
}

export function getBotCombatProfile(
  mode: MatchMode = 'battle_royale',
  difficulty: BotDifficulty = 'normal',
  rankedRp = 350,
): BotCombatProfile {
  let effectiveLevel = 0.45;
  if (mode === 'ranked') {
    const rankNorm = clamp(rankedRp / 5200, 0, 1);
    effectiveLevel = 0.38 + rankNorm * 0.62;
  } else {
    if (difficulty === 'easy') effectiveLevel = 0.12;
    else if (difficulty === 'normal') effectiveLevel = 0.45;
    else if (difficulty === 'hard') effectiveLevel = 0.78;
    else effectiveLevel = 1.0;
  }

  return {
    effectiveLevel,
    acquireMin: lerp(0.42, 0.11, effectiveLevel),
    acquireMax: lerp(0.75, 0.22, effectiveLevel),
    cadenceMult: lerp(1.75, 1.02, effectiveLevel),
    burstMin: Math.round(lerp(3, 6, effectiveLevel)),
    burstMax: Math.round(lerp(6, 12, effectiveLevel)),
    spreadScale: lerp(1.48, 0.72, effectiveLevel),
    dmgScale: lerp(0.68, 1.04, effectiveLevel),
    strafeSwitchInterval: lerp(1.25, 0.42, effectiveLevel),
    crouchSpamChance: lerp(0.05, 0.62, effectiveLevel),
    jumpDodgeChance: lerp(0.08, 0.58, effectiveLevel),
    slidePushChance: lerp(0.05, 0.48, effectiveLevel),
    healPunishDist: lerp(30, 72, effectiveLevel),
  };
}

export function shouldBotPunishHeal(
  targetHealing: number,
  dist: number,
  losClear: boolean,
  maxPunishDist = 56,
): boolean {
  return targetHealing > 0 && losClear && dist <= maxPunishDist;
}

export function getBotSkillDistribution(
  totalBots = BOT_COUNT,
  mode: MatchMode = 'battle_royale',
  difficulty: BotDifficulty = 'normal',
  rankedRp = 350,
): {
  noob: number;
  veteran: number;
  pro: number;
} {
  let proShare = 0.25;
  let vetShare = 0.375;

  if (mode === 'ranked') {
    const rankNorm = clamp(rankedRp / 5200, 0, 1);
    proShare = lerp(0.18, 0.68, rankNorm);
    vetShare = lerp(0.38, 0.26, rankNorm);
  } else if (difficulty === 'easy') {
    proShare = 0.08;
    vetShare = 0.25;
  } else if (difficulty === 'normal') {
    proShare = 0.25;
    vetShare = 0.375;
  } else if (difficulty === 'hard') {
    proShare = 0.46;
    vetShare = 0.38;
  } else {
    proShare = 0.68;
    vetShare = 0.26;
  }

  const pro = Math.round(totalBots * proShare);
  const veteran = Math.round(totalBots * vetShare);
  const noob = Math.max(0, totalBots - pro - veteran);
  return { noob, veteran, pro };
}

export function rollPirateToken(
  nowMs: number,
  rng: () => number = Math.random,
  alreadyActive = false,
): { granted: boolean; expiresAt: number } {
  if (alreadyActive) {
    return { granted: false, expiresAt: 0 };
  }
  if (rng() < PIRATE_TOKEN_CHANCE) {
    return { granted: true, expiresAt: nowMs + PIRATE_DURATION_MS };
  }
  return { granted: false, expiresAt: 0 };
}

export function isPirateTokenActive(pirateExpiresAt: number, nowMs: number = Date.now()): boolean {
  return nowMs < pirateExpiresAt;
}

export function getCurrentPoiName(x: number, z: number): string {
  for (const poi of POIS) {
    if (Math.hypot(x - poi.x, z - poi.z) < poi.r) {
      return poi.name.toUpperCase();
    }
  }
  return 'ISLAND WILDERNESS';
}

export function segmentToPointDistSq(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  px: number,
  py: number,
  pz: number,
): { distSq: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq < 1e-8) {
    const dx = px - ax;
    const dy = py - ay;
    const dz = pz - az;
    return { distSq: dx * dx + dy * dy + dz * dz, t: 0 };
  }
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const t = clamp((apx * abx + apy * aby + apz * abz) / lenSq, 0, 1);
  const cx = ax + abx * t - px;
  const cy = ay + aby * t - py;
  const cz = az + abz * t - pz;
  return { distSq: cx * cx + cy * cy + cz * cz, t };
}

export function sweptSphereSegmentHit(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  px: number,
  py: number,
  pz: number,
  combinedRadius: number,
): { hit: boolean; t: number; distSq: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const mx = ax - px;
  const my = ay - py;
  const mz = az - pz;

  const rSq = combinedRadius * combinedRadius;
  const c = mx * mx + my * my + mz * mz - rSq;
  if (c <= 0) {
    return { hit: true, t: 0, distSq: mx * mx + my * my + mz * mz };
  }

  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-8) {
    return { hit: false, t: 1, distSq: mx * mx + my * my + mz * mz };
  }

  const b = mx * dx + my * dy + mz * dz;
  if (b > 0) {
    return { hit: false, t: 1, distSq: mx * mx + my * my + mz * mz };
  }

  const disc = b * b - a * c;
  if (disc < 0) {
    const closest = segmentToPointDistSq(ax, ay, az, bx, by, bz, px, py, pz);
    return { hit: false, t: closest.t, distSq: closest.distSq };
  }

  const t = (-b - Math.sqrt(disc)) / a;
  if (t >= 0 && t <= 1) {
    return { hit: true, t, distSq: rSq };
  }

  const closest = segmentToPointDistSq(ax, ay, az, bx, by, bz, px, py, pz);
  return { hit: false, t: closest.t, distSq: closest.distSq };
}

export function sweptSphereCapsuleHit(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  baseX: number,
  baseY: number,
  baseZ: number,
  minOffsetY: number,
  maxOffsetY: number,
  combinedRadius: number,
): { hit: boolean; t: number } {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d1z = bz - az;
  const p0y = baseY + minOffsetY;
  const d2y = maxOffsetY - minOffsetY;

  const rx = ax - baseX;
  const ry = ay - p0y;
  const rz = az - baseZ;

  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2y * d2y;
  const f = d2y * ry;

  let s = 0;
  let u = 0;

  if (a <= 1e-8 && e <= 1e-8) {
    const distSq = rx * rx + ry * ry + rz * rz;
    return { hit: distSq <= combinedRadius * combinedRadius, t: 0 };
  }
  if (a <= 1e-8) {
    s = 0;
    u = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-8) {
      u = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1y * d2y;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      u = (b * s + f) / e;
      if (u < 0) {
        u = 0;
        s = clamp(-c / a, 0, 1);
      } else if (u > 1) {
        u = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }

  const spineY = p0y + d2y * u;
  const cx = ax + d1x * s - baseX;
  const cy = ay + d1y * s - spineY;
  const cz = az + d1z * s - baseZ;
  if (cx * cx + cy * cy + cz * cz > combinedRadius * combinedRadius) {
    return { hit: false, t: 1 };
  }

  const refined = sweptSphereSegmentHit(ax, ay, az, bx, by, bz, baseX, spineY, baseZ, combinedRadius);
  return { hit: true, t: refined.hit ? refined.t : s };
}

export function computeBotLeadPoint(
  shooterX: number,
  shooterZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  targetVx: number,
  targetVz: number,
  bulletSpeed: number,
  accuracyFactor = 0.85,
): { x: number; y: number; z: number } {
  const dist = Math.hypot(targetX - shooterX, targetZ - shooterZ);
  const leadTime = clamp(dist / Math.max(40, bulletSpeed), 0, 0.75) * accuracyFactor;
  return {
    x: targetX + targetVx * leadTime,
    y: targetY,
    z: targetZ + targetVz * leadTime,
  };
}

export function resolveBotBuildingWaypoint(
  botX: number,
  botZ: number,
  targetX: number,
  targetZ: number,
  buildings: BuildingNavVolume[],
): { x: number; z: number } {
  const isInside = (x: number, z: number, b: BuildingNavVolume, pad = 0) =>
    x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;

  // 1. Inside a building and aiming for a target outside it -> exit via the front doorway
  for (const b of buildings) {
    if (isInside(botX, botZ, b, -0.15) && !isInside(targetX, targetZ, b, 0.25)) {
      if (Math.abs(botX - b.doorX) > 1.55 && botZ < b.thresholdZ - 0.5) {
        return { x: b.doorX, z: b.thresholdZ - 1.35 };
      }
      return { x: b.doorX, z: b.doorZ };
    }
  }

  // 2. Outside a building and aiming for a chest/loot inside it -> clear exterior walls cleanly and walk through front doorway
  for (const b of buildings) {
    if (isInside(targetX, targetZ, b, -0.05) && !isInside(botX, botZ, b, 0.1)) {
      if (Math.abs(botX - b.doorX) <= 1.55 && botZ >= b.thresholdZ - 0.25 && botZ <= b.doorZ + 2.4) {
        return { x: b.doorX, z: b.thresholdZ - 1.45 };
      }
      const goLeft = Math.abs(botX - (b.minX - 2.4)) <= Math.abs(botX - (b.maxX + 2.4));
      const sideClearX = goLeft ? b.minX - 2.4 : b.maxX + 2.4;

      if (botZ < b.minZ - 0.4 && botX > b.minX - 1.6 && botX < b.maxX + 1.6) {
        return { x: sideClearX, z: Math.min(botZ, b.minZ - 2.2) };
      }
      if (botZ < b.thresholdZ + 0.8) {
        return { x: botX < b.doorX ? Math.min(botX, b.minX - 2.1) : Math.max(botX, b.maxX + 2.1), z: b.doorZ + 0.7 };
      }
      return { x: b.doorX, z: b.doorZ };
    }
  }

  return { x: targetX, z: targetZ };
}

export function stepChestSearchProgress(
  elapsed: number,
  dt: number,
  dist: number,
  maxDist: number,
  interrupted: boolean,
  duration: number = CHEST_OPEN_TIME,
): { elapsed: number; pct: number; completed: boolean; canceled: boolean } {
  if (interrupted || dist > maxDist) {
    return { elapsed: 0, pct: 0, completed: false, canceled: true };
  }
  const safeDur = Math.max(0.1, duration);
  const nextElapsed = Math.min(safeDur, Math.max(0, elapsed) + Math.max(0, dt));
  const pct = clamp((nextElapsed / safeDur) * 100, 0, 100);
  return {
    elapsed: nextElapsed,
    pct,
    completed: nextElapsed >= safeDur - 1e-6,
    canceled: false,
  };
}

export function applyStructureDamage(
  hp: number,
  dmg: number,
  isPickaxe: boolean,
): { nextHp: number; broken: boolean } {
  const effectiveDmg = Math.max(0, dmg) * (isPickaxe ? 2.0 : 1.0);
  const nextHp = Math.max(0, hp - effectiveDmg);
  return {
    nextHp,
    broken: nextHp <= 0,
  };
}

export function assignBotSquads(botCount: number = BOT_COUNT, squadSize = 3): number[] {
  const safeSize = Math.max(1, Math.floor(squadSize));
  const squads: number[] = [];
  for (let i = 0; i < botCount; i++) {
    squads.push(Math.floor(i / safeSize));
  }
  return squads;
}

export function areBotsTeammates(squadA: number, squadB: number): boolean {
  return squadA >= 0 && squadA === squadB;
}

export function shouldBotBroadcastPing(
  pingCooldown: number,
  losClear: boolean,
  hasTarget: boolean,
): boolean {
  return hasTarget && losClear && pingCooldown <= 0;
}

export function computeBotFlankWaypoint(
  botX: number,
  botZ: number,
  targetX: number,
  targetZ: number,
  flankSide: 1 | -1,
  radius = 15,
  arcRad = 1.05,
): { x: number; z: number } {
  const baseAng = Math.atan2(botZ - targetZ, botX - targetX);
  const orbitAng = baseAng + flankSide * arcRad;
  return {
    x: targetX + Math.cos(orbitAng) * radius,
    z: targetZ + Math.sin(orbitAng) * radius,
  };
}

export function getTeamSizeForMode(mode: TeamMode): number {
  return TEAM_MODE_DEFS[mode]?.teamSize ?? 2;
}

export function sanitizePlayerName(raw: string, fallback = 'AgentZero'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, 16);
}

export function normalizePartyCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('FBX') && cleaned.length > 3) {
    return `FBX-${cleaned.slice(3, 7)}`;
  }
  return `FBX-${cleaned.slice(0, 4)}`;
}

export function generatePartyCode(rng: () => number = Math.random): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(clamp(rng(), 0, 0.999999) * chars.length)];
  }
  return `FBX-${suffix}`;
}

export function isFriendlyTarget(teamA: number, teamB: number): boolean {
  return teamA >= 0 && teamB >= 0 && teamA === teamB;
}

export function computeAliveTeamsCount(combatants: Array<{ teamId: number; alive: boolean }>): number {
  const aliveTeams = new Set<number>();
  for (const c of combatants) {
    if (c.alive) aliveTeams.add(c.teamId);
  }
  return aliveTeams.size;
}

export function seededRng(seed: number): () => number {
  let state = (Math.floor(seed) >>> 0) || 1337;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function assignMatchTeams(params: {
  humanMembers: Array<{ id: string; name: string; skinId: string; emoteId: EmoteId }>;
  teamMode: TeamMode;
  fillTeammates: boolean;
  totalPlayers?: number;
  botNames?: string[];
  difficulty?: BotDifficulty;
  matchMode?: MatchMode;
  rankedRp?: number;
  seed?: number;
}): Array<{
  id: string;
  name: string;
  skinId: string;
  emoteId: EmoteId;
  teamId: number;
  isHuman: boolean;
  skillTier?: BotSkillTier;
}> {
  const teamSize = getTeamSizeForMode(params.teamMode);
  const targetTotal = Math.max(params.humanMembers.length + 1, params.totalPlayers ?? BOT_COUNT + 1);
  const rng = seededRng(params.seed ?? 4242);
  const availableSkins = SKINS.filter((s) => s.id !== 'goldman');
  const names = params.botNames && params.botNames.length > 0 ? params.botNames : BOT_NAMES;

  const roster: Array<{
    id: string;
    name: string;
    skinId: string;
    emoteId: EmoteId;
    teamId: number;
    isHuman: boolean;
    skillTier?: BotSkillTier;
  }> = [];

  // Place party humans into teamId = 0 (split into additional teams only if > teamSize humans ever queued)
  let nextTeamId = 0;
  let slotsLeftOnCurrentHumanTeam = teamSize;
  for (let i = 0; i < params.humanMembers.length; i++) {
    if (i > 0 && slotsLeftOnCurrentHumanTeam <= 0) {
      nextTeamId++;
      slotsLeftOnCurrentHumanTeam = teamSize;
    }
    const hm = params.humanMembers[i];
    roster.push({
      id: hm.id,
      name: sanitizePlayerName(hm.name),
      skinId: hm.skinId || 'recruit',
      emoteId: hm.emoteId || 'boogie',
      teamId: nextTeamId,
      isHuman: true,
    });
    slotsLeftOnCurrentHumanTeam--;
  }

  // Remaining open slots on player's team filled by AI teammates when fillTeammates is enabled
  const botsNeeded = Math.max(0, targetTotal - roster.length);
  const dist = getBotSkillDistribution(
    botsNeeded,
    params.matchMode ?? 'battle_royale',
    params.difficulty ?? 'normal',
    params.rankedRp ?? 350,
  );
  const tierPool: BotSkillTier[] = [];
  for (let i = 0; i < dist.pro; i++) tierPool.push('pro');
  for (let i = 0; i < dist.veteran; i++) tierPool.push('veteran');
  while (tierPool.length < botsNeeded) tierPool.push('noob');
  for (let i = tierPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = tierPool[i];
    tierPool[i] = tierPool[j];
    tierPool[j] = tmp;
  }

  let botCursor = 0;
  if (params.fillTeammates && params.humanMembers.length > 0) {
    while (slotsLeftOnCurrentHumanTeam > 0 && botCursor < botsNeeded) {
      const idx = botCursor++;
      const skin = availableSkins[Math.floor(rng() * availableSkins.length)]?.id ?? 'recruit';
      const botName = names[idx % names.length];
      roster.push({
        id: `bot-ally-${idx}`,
        name: botName,
        skinId: skin,
        emoteId: 'boogie',
        teamId: nextTeamId,
        isHuman: false,
        skillTier: tierPool[idx] ?? 'veteran',
      });
      slotsLeftOnCurrentHumanTeam--;
    }
  }

  // Opponent AI teams grouped cleanly by teamSize
  nextTeamId++;
  let enemyInGroup = 0;
  while (botCursor < botsNeeded) {
    if (enemyInGroup >= teamSize) {
      nextTeamId++;
      enemyInGroup = 0;
    }
    const idx = botCursor++;
    const skin = availableSkins[Math.floor(rng() * availableSkins.length)]?.id ?? 'recruit';
    const botName = names[idx % names.length];
    roster.push({
      id: `bot-${idx}`,
      name: botName,
      skinId: skin,
      emoteId: 'boogie',
      teamId: nextTeamId,
      isHuman: false,
      skillTier: tierPool[idx] ?? 'veteran',
    });
    enemyInGroup++;
  }

  return roster;
}

export function formatKeyCodeLabel(code: string): string {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  switch (code) {
    case 'Space':
      return 'SPACE';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'SHIFT';
    case 'ControlLeft':
    case 'ControlRight':
      return 'CTRL';
    case 'AltLeft':
    case 'AltRight':
      return 'ALT';
    case 'Tab':
      return 'TAB';
    case 'Backquote':
      return '`';
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Slash':
      return '/';
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    default:
      return code.toUpperCase();
  }
}

export function updateKeybind(
  binds: KeybindsConfig,
  action: KeybindAction,
  newCode: string,
): KeybindsConfig {
  const prevCode = binds[action];
  if (prevCode === newCode) return binds;
  const next: KeybindsConfig = { ...binds };
  for (const key of Object.keys(next) as KeybindAction[]) {
    if (key !== action && next[key] === newCode) {
      next[key] = prevCode;
    }
  }
  next[action] = newCode;
  return next;
}

export function computeShotgunPelletSpreadOffsets(
  pellets: number,
  spread: number,
  isAiming: boolean,
  rng: () => number = Math.random,
): Array<{ right: number; up: number }> {
  if (pellets <= 1) {
    return [
      {
        right: (rng() - 0.5) * spread * (isAiming ? 0.45 : 1),
        up: (rng() - 0.5) * spread * (isAiming ? 0.45 : 1),
      },
    ];
  }
  const effectiveSpread = spread * (isAiming ? 0.52 : 0.82);
  const offsets: Array<{ right: number; up: number }> = [
    {
      right: (rng() - 0.5) * effectiveSpread * 0.16,
      up: (rng() - 0.5) * effectiveSpread * 0.16,
    },
  ];
  const ringCount = pellets - 1;
  const phaseOffset = rng() * 0.25;
  for (let i = 0; i < ringCount; i++) {
    const ang = (i / ringCount) * Math.PI * 2 + phaseOffset;
    const rad = effectiveSpread * (0.58 + rng() * 0.34);
    offsets.push({
      right: Math.cos(ang) * rad,
      up: Math.sin(ang) * rad,
    });
  }
  return offsets;
}

export interface DbnoCombatantLike {
  id: string;
  teamId: number;
  alive: boolean;
  knocked?: boolean;
}

export function shouldEnterDbno(
  teamId: number,
  targetId: string,
  combatants: DbnoCombatantLike[],
): boolean {
  return combatants.some(
    (c) => c.id !== targetId && c.teamId === teamId && c.alive && !c.knocked,
  );
}

export function findSquadWipeTargets(
  teamId: number,
  excludingId: string,
  combatants: DbnoCombatantLike[],
): string[] {
  const stillStanding = combatants.some(
    (c) => c.id !== excludingId && c.teamId === teamId && c.alive && !c.knocked,
  );
  if (stillStanding) return [];
  return combatants
    .filter((c) => c.id !== excludingId && c.teamId === teamId && c.alive && Boolean(c.knocked))
    .map((c) => c.id);
}

export function stepDbnoBleed(
  dbnoHp: number,
  dt: number,
  beingRevived: boolean,
  bleedRate = DBNO_BLEED_RATE,
): { dbnoHp: number; bledOut: boolean } {
  if (beingRevived) {
    return { dbnoHp: Math.max(0, dbnoHp), bledOut: dbnoHp <= 0 };
  }
  const next = Math.max(0, dbnoHp - Math.max(0, dt) * bleedRate);
  return { dbnoHp: next, bledOut: next <= 0 };
}

export function applyDbnoDamage(
  dbnoHp: number,
  damage: number,
): { dbnoHp: number; eliminated: boolean } {
  const next = Math.max(0, dbnoHp - Math.max(0, damage));
  return { dbnoHp: next, eliminated: next <= 0 };
}

export function computeReviveResult(): { hp: number; shield: number; knocked: false } {
  return { hp: 30, shield: 0, knocked: false };
}

export function computeRebootResult(): { hp: number; shield: number; alive: true; knocked: false } {
  return { hp: 100, shield: 0, alive: true, knocked: false };
}


