import * as THREE from 'three';
import { AMMO_DEFS, SKINS } from './constants';
import type { ProceduralTextures } from './textures';
import type { AmmoType, BotSkillTier, EmoteId, InventoryItem, WeaponId } from './types';

export type HitboxZone = 'head' | 'chest' | 'pelvis' | 'arm' | 'leg';

export interface RigHitboxPart {
  mesh: THREE.Mesh;
  zone: HitboxZone;
  multiplier: number;
}

const invisibleHitMat = new THREE.MeshBasicMaterial({ visible: false });
const sharedFlashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const sharedEyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
const sharedEyeHighlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const sharedOpticDot = new THREE.MeshBasicMaterial({ color: 0xf43f5e });

interface SharedPropMats {
  darkMetal: THREE.MeshStandardMaterial;
  gunmetal: THREE.MeshStandardMaterial;
  silverMetal: THREE.MeshStandardMaterial;
  woodGrip: THREE.MeshStandardMaterial;
  tacRed: THREE.MeshStandardMaterial;
  pickaxeEdge: THREE.MeshStandardMaterial;
  scopeGlass: THREE.MeshStandardMaterial;
  shieldLiquid: THREE.MeshStandardMaterial;
  chugBody: THREE.MeshStandardMaterial;
  medkitBody: THREE.MeshStandardMaterial;
  medkitCross: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  bootSole: THREE.MeshStandardMaterial;
  pirateBrim: THREE.MeshStandardMaterial;
  pirateCrown: THREE.MeshStandardMaterial;
  crownGold: THREE.MeshStandardMaterial;
  proBadge: THREE.MeshStandardMaterial;
  veteranBadge: THREE.MeshStandardMaterial;
  chestGold: THREE.MeshStandardMaterial;
  chestTrim: THREE.MeshStandardMaterial;
  chestCrystal: THREE.MeshStandardMaterial;
  gliderWing: THREE.MeshStandardMaterial;
  busBlue: THREE.MeshStandardMaterial;
  busYellow: THREE.MeshStandardMaterial;
  busFlame: THREE.MeshBasicMaterial;
}

const propMatsByTex = new WeakMap<ProceduralTextures, SharedPropMats>();
let fallbackPropMats: SharedPropMats | null = null;

function getSharedPropMats(textures?: ProceduralTextures): SharedPropMats {
  if (textures) {
    const existing = propMatsByTex.get(textures);
    if (existing) return existing;
  } else if (fallbackPropMats) {
    return fallbackPropMats;
  }

  const reg = <T extends THREE.MeshStandardMaterial>(m: T): T =>
    textures ? textures.registerTierMaterial(m) : m;

  const gunNorm = textures?.gunmetal.normalMap ?? null;
  const gunRough = textures?.gunmetal.roughnessMap ?? null;
  const gunSpec = textures?.gunmetal.specularMap ?? null;
  const woodMap = textures?.wood.map ?? null;
  const woodNorm = textures?.wood.normalMap ?? null;
  const woodRough = textures?.wood.roughnessMap ?? null;
  const woodSpec = textures?.wood.specularMap ?? null;
  const hexNorm = textures?.armorHex.normalMap ?? null;
  const hexRough = textures?.armorHex.roughnessMap ?? null;
  const hexSpec = textures?.armorHex.specularMap ?? null;
  const fabNorm = textures?.fabric.normalMap ?? null;
  const fabRough = textures?.fabric.roughnessMap ?? null;
  const fabSpec = textures?.fabric.specularMap ?? null;

  const mats: SharedPropMats = {
    darkMetal: reg(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        normalMap: gunNorm,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughnessMap: gunRough,
        metalnessMap: gunSpec,
        metalness: 0.42,
        roughness: 0.48,
      }),
    ),
    gunmetal: reg(
      new THREE.MeshStandardMaterial({
        color: 0x475569,
        normalMap: gunNorm,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: gunRough,
        metalnessMap: gunSpec,
        metalness: 0.48,
        roughness: 0.44,
      }),
    ),
    silverMetal: reg(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        normalMap: gunNorm,
        normalScale: new THREE.Vector2(0.65, 0.65),
        roughnessMap: gunRough,
        metalnessMap: gunSpec,
        metalness: 0.54,
        roughness: 0.36,
      }),
    ),
    woodGrip: reg(
      new THREE.MeshStandardMaterial({
        color: 0xa16236,
        map: woodMap,
        normalMap: woodNorm,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: woodRough,
        metalnessMap: woodSpec,
        roughness: 0.72,
        metalness: 0.08,
      }),
    ),
    tacRed: reg(
      new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        normalMap: hexNorm,
        roughnessMap: hexRough,
        metalnessMap: hexSpec,
        roughness: 0.54,
        metalness: 0.16,
      }),
    ),
    pickaxeEdge: reg(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.24,
        roughness: 0.34,
        metalness: 0.45,
      }),
    ),
    scopeGlass: reg(
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.26,
        roughness: 0.22,
        metalness: 0.28,
        clearcoat: 0.18,
      }),
    ),
    shieldLiquid: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.26,
      roughness: 0.28,
      metalness: 0.12,
      transparent: true,
      opacity: 0.92,
    }),
    chugBody: new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.28,
      roughness: 0.26,
      metalness: 0.18,
      transparent: true,
      opacity: 0.94,
    }),
    medkitBody: reg(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        normalMap: hexNorm,
        roughnessMap: hexRough,
        metalnessMap: hexSpec,
        roughness: 0.56,
        metalness: 0.12,
      }),
    ),
    medkitCross: new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.18,
      roughness: 0.44,
    }),
    boot: reg(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        normalMap: fabNorm,
        roughnessMap: fabRough,
        metalnessMap: fabSpec,
        roughness: 0.56,
        metalness: 0.16,
      }),
    ),
    bootSole: reg(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        normalMap: hexNorm,
        roughness: 0.85,
        metalness: 0.06,
      }),
    ),
    pirateBrim: reg(
      new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        normalMap: fabNorm,
        roughnessMap: fabRough,
        roughness: 0.72,
      }),
    ),
    pirateCrown: reg(
      new THREE.MeshStandardMaterial({
        color: 0x7f1d1d,
        normalMap: fabNorm,
        roughnessMap: fabRough,
        roughness: 0.7,
      }),
    ),
    crownGold: reg(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.16,
        normalMap: gunNorm,
        roughnessMap: gunRough,
        metalnessMap: gunSpec,
        metalness: 0.56,
        roughness: 0.34,
      }),
    ),
    proBadge: new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 0.35,
      roughness: 0.32,
    }),
    veteranBadge: new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.28,
      roughness: 0.34,
    }),
    chestGold: reg(
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        map: woodMap,
        normalMap: woodNorm,
        roughnessMap: woodRough,
        metalnessMap: woodSpec,
        emissive: 0x92400e,
        emissiveIntensity: 0.12,
        metalness: 0.36,
        roughness: 0.46,
      }),
    ),
    chestTrim: reg(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        normalMap: gunNorm,
        roughnessMap: gunRough,
        metalnessMap: gunSpec,
        emissive: 0xfacc15,
        emissiveIntensity: 0.18,
        metalness: 0.5,
        roughness: 0.34,
      }),
    ),
    chestCrystal: new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfde047,
      emissiveIntensity: 0.42,
      roughness: 0.25,
    }),
    gliderWing: reg(
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        map: textures?.fabric.map ?? null,
        normalMap: fabNorm,
        roughnessMap: fabRough,
        metalnessMap: fabSpec,
        emissive: 0x0369a1,
        emissiveIntensity: 0.1,
        metalness: 0.22,
        roughness: 0.48,
      }),
    ),
    busBlue: reg(
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8,
        map: textures?.metal.map ?? null,
        normalMap: textures?.metal.normalMap ?? null,
        roughnessMap: textures?.metal.roughnessMap ?? null,
        metalnessMap: textures?.metal.specularMap ?? null,
        metalness: 0.3,
        roughness: 0.46,
      }),
    ),
    busYellow: reg(
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        map: textures?.armorHex.map ?? null,
        normalMap: hexNorm,
        roughness: 0.48,
        metalness: 0.2,
      }),
    ),
    busFlame: new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.92,
    }),
  };

  if (textures) propMatsByTex.set(textures, mats);
  else fallbackPropMats = mats;
  return mats;
}

const rarityAccentMats = new Map<number, THREE.MeshStandardMaterial>();
function getRarityAccentMat(hex: number): THREE.MeshStandardMaterial {
  let mat = rarityAccentMats.get(hex);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0.24,
      roughness: 0.38,
      metalness: 0.24,
    });
    rarityAccentMats.set(hex, mat);
  }
  return mat;
}

function createBeveledRectGeo(w: number, h: number, d: number, radius: number, bevel = 0.03): THREE.ExtrudeGeometry {
  const hw = w / 2 - radius;
  const hh = h / 2 - radius;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -h / 2);
  shape.lineTo(hw, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
  shape.lineTo(w / 2, hh);
  shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
  shape.lineTo(-hw, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
  shape.lineTo(-w / 2, -hh);
  shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, d - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.center();
  return geo;
}

// Detailed multi-part beveled weapon & pickaxe geometries (Grip centered at local 0,0,0)
const wArReceiverGeo = createBeveledRectGeo(0.115, 0.14, 0.68, 0.02, 0.015);
const wArRailGeo = new THREE.BoxGeometry(0.058, 0.024, 0.58);
const wArShroudGeo = new THREE.CylinderGeometry(0.056, 0.062, 0.4, 12);
const wArShroudRingGeo = new THREE.TorusGeometry(0.061, 0.012, 6, 12);
const wArBarrelGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.56, 12);
const wArMuzzleGeo = new THREE.CylinderGeometry(0.036, 0.03, 0.12, 12);
const wArMagGeo = createBeveledRectGeo(0.054, 0.25, 0.105, 0.014, 0.008);
const wArGripGeo = new THREE.BoxGeometry(0.05, 0.155, 0.072);
const wArForegripGeo = new THREE.CylinderGeometry(0.026, 0.022, 0.145, 10);
const wArStockGeo = createBeveledRectGeo(0.086, 0.155, 0.3, 0.02, 0.012);
const wArSightFrameGeo = new THREE.BoxGeometry(0.056, 0.068, 0.13);
const wArDotGeo = new THREE.BoxGeometry(0.022, 0.022, 0.02);
const wArChargeGeo = new THREE.BoxGeometry(0.085, 0.022, 0.042);
const wStripGeo = new THREE.BoxGeometry(0.124, 0.026, 0.38);

const wShotBodyGeo = createBeveledRectGeo(0.126, 0.15, 0.62, 0.022, 0.015);
const wShotBarrelGeo = new THREE.CylinderGeometry(0.034, 0.036, 0.66, 14);
const wShotTubeGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.54, 12);
const wShotPumpGeo = new THREE.CylinderGeometry(0.052, 0.05, 0.3, 14);
const wShotShellGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.068, 8);

const wSmgBodyGeo = createBeveledRectGeo(0.098, 0.14, 0.46, 0.018, 0.012);
const wSmgBarrelGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.34, 12);
const wSmgMagGeo = new THREE.BoxGeometry(0.048, 0.29, 0.068);
const wSmgStockGeo = new THREE.BoxGeometry(0.054, 0.088, 0.24);

const wSniperBodyGeo = createBeveledRectGeo(0.105, 0.145, 0.92, 0.02, 0.014);
const wSniperBarrelGeo = new THREE.CylinderGeometry(0.022, 0.03, 0.88, 12);
const wSniperScopeGeo = new THREE.CylinderGeometry(0.048, 0.046, 0.46, 14);
const wSniperScopeBellGeo = new THREE.CylinderGeometry(0.058, 0.048, 0.12, 14);
const wSniperRingGeo = new THREE.CylinderGeometry(0.056, 0.056, 0.035, 14);
const wSniperLensGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.02, 14);
const wSniperBipodGeo = new THREE.CylinderGeometry(0.012, 0.01, 0.22, 8);

const wPickShaftGeo = new THREE.CylinderGeometry(0.026, 0.03, 0.92, 12);
const wPickGripGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.26, 12);
const wPickCollarGeo = new THREE.CylinderGeometry(0.052, 0.044, 0.11, 12);
const wPickHeadGeo = createBeveledRectGeo(0.58, 0.14, 0.078, 0.025, 0.014);
const wPickSpikeGeo = new THREE.ConeGeometry(0.056, 0.26, 6);
const wPickCoreGeo = new THREE.BoxGeometry(0.48, 0.045, 0.092);

const wPotionGeo = new THREE.CylinderGeometry(0.115, 0.138, 0.34, 18);
const wPotionNeckGeo = new THREE.CylinderGeometry(0.055, 0.095, 0.07, 14);
const wPotionCapGeo = new THREE.CylinderGeometry(0.068, 0.072, 0.065, 14);
const wMedKitGeo = createBeveledRectGeo(0.3, 0.23, 0.15, 0.028, 0.015);
const wMedCrossVGeo = new THREE.BoxGeometry(0.048, 0.135, 0.165);
const wMedCrossHGeo = new THREE.BoxGeometry(0.135, 0.048, 0.165);
const wMedHandleGeo = new THREE.BoxGeometry(0.13, 0.042, 0.065);

const wChugGeo = new THREE.CylinderGeometry(0.185, 0.175, 0.4, 20);
const wChugBandGeo = new THREE.TorusGeometry(0.186, 0.02, 8, 22);
const wChugCapGeo = new THREE.CylinderGeometry(0.082, 0.092, 0.075, 14);
const wChugHandleGeo = new THREE.TorusGeometry(0.078, 0.02, 8, 14, Math.PI);

export function createWeaponModel(
  weaponId: WeaponId,
  rarityHex?: number,
  textures?: ProceduralTextures,
): THREE.Group {
  const g = new THREE.Group();
  const pm = getSharedPropMats(textures);
  const accentMat = rarityHex ? getRarityAccentMat(rarityHex) : pm.silverMetal;

  // Offset so every gun's pistol grip center sits at (0, 0, 0) inside the character's right palm
  const gunPivotOffsetY = 0.125;
  const gunPivotOffsetZ = 0.155;

  if (weaponId === 'pickaxe') {
    const grip = new THREE.Mesh(wPickGripGeo, pm.gunmetal);
    grip.position.set(0, 0, 0);

    const shaft = new THREE.Mesh(wPickShaftGeo, pm.darkMetal);
    shaft.rotation.x = 0.05;
    shaft.position.set(0, 0.34, 0.02);

    const collar = new THREE.Mesh(wPickCollarGeo, pm.silverMetal);
    collar.position.set(0, 0.72, 0.04);

    const head = new THREE.Mesh(wPickHeadGeo, pm.silverMetal);
    head.rotation.y = Math.PI / 2;
    head.position.set(0, 0.77, 0.045);

    const frontEdge = new THREE.Mesh(wPickCoreGeo, pm.pickaxeEdge);
    frontEdge.rotation.y = Math.PI / 2;
    frontEdge.position.set(0, 0.77, 0.045);

    const frontSpike = new THREE.Mesh(wPickSpikeGeo, pm.silverMetal);
    frontSpike.rotation.x = Math.PI / 2;
    frontSpike.position.set(0, 0.77, 0.39);

    const backSpike = new THREE.Mesh(wPickSpikeGeo, pm.gunmetal);
    backSpike.rotation.x = -Math.PI / 2;
    backSpike.position.set(0, 0.77, -0.29);

    const pommel = new THREE.Mesh(wPotionCapGeo, pm.pickaxeEdge);
    pommel.position.set(0, -0.15, 0);

    g.add(grip, shaft, collar, head, frontEdge, frontSpike, backSpike, pommel);
    return g;
  }

  const gunGroup = new THREE.Group();
  if (weaponId === 'ar') {
    const body = new THREE.Mesh(wArReceiverGeo, pm.darkMetal);
    const rail = new THREE.Mesh(wArRailGeo, pm.silverMetal);
    rail.position.set(0, 0.082, 0.1);
    const shroud = new THREE.Mesh(wArShroudGeo, pm.gunmetal);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.015, 0.36);
    for (const rz of [0.22, 0.35, 0.48]) {
      const ring = new THREE.Mesh(wArShroudRingGeo, pm.darkMetal);
      ring.position.set(0, 0.015, rz);
      gunGroup.add(ring);
    }
    const barrel = new THREE.Mesh(wArBarrelGeo, pm.silverMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.6);
    const muzzle = new THREE.Mesh(wArMuzzleGeo, pm.darkMetal);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.02, 0.89);
    const mag = new THREE.Mesh(wArMagGeo, pm.gunmetal);
    mag.position.set(0, -0.155, 0.11);
    mag.rotation.x = 0.26;
    const grip = new THREE.Mesh(wArGripGeo, pm.gunmetal);
    grip.position.set(0, -0.125, -gunPivotOffsetZ);
    grip.rotation.x = -0.22;
    const foregrip = new THREE.Mesh(wArForegripGeo, pm.darkMetal);
    foregrip.position.set(0, -0.095, 0.38);
    const stock = new THREE.Mesh(wArStockGeo, pm.woodGrip);
    stock.position.set(0, -0.02, -0.44);
    const charge = new THREE.Mesh(wArChargeGeo, pm.silverMetal);
    charge.position.set(0, 0.055, -0.24);
    const sight = new THREE.Mesh(wArSightFrameGeo, pm.darkMetal);
    sight.position.set(0, 0.12, 0.04);
    const redDot = new THREE.Mesh(wArDotGeo, sharedOpticDot);
    redDot.position.set(0, 0.125, 0.04);
    const strip = new THREE.Mesh(wStripGeo, accentMat);
    strip.position.set(0, 0.03, 0.04);
    gunGroup.add(body, rail, shroud, barrel, muzzle, mag, grip, foregrip, stock, charge, sight, redDot, strip);
    gunGroup.position.set(0, gunPivotOffsetY, gunPivotOffsetZ);
    g.add(gunGroup);
  } else if (weaponId === 'pump' || weaponId === 'tac') {
    const body = new THREE.Mesh(wShotBodyGeo, pm.darkMetal);
    const rail = new THREE.Mesh(wArRailGeo, pm.gunmetal);
    rail.scale.z = 0.72;
    rail.position.set(0, 0.085, 0.08);
    const barrel = new THREE.Mesh(wShotBarrelGeo, pm.silverMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, 0.54);
    const tube = new THREE.Mesh(wShotTubeGeo, pm.gunmetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.022, 0.46);
    const pump = new THREE.Mesh(wShotPumpGeo, weaponId === 'pump' ? pm.woodGrip : pm.tacRed);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.035, 0.43);
    const grip = new THREE.Mesh(wArGripGeo, pm.gunmetal);
    grip.position.set(0, -0.12, -gunPivotOffsetZ);
    grip.rotation.x = -0.24;
    const stock = new THREE.Mesh(wArStockGeo, weaponId === 'pump' ? pm.woodGrip : pm.darkMetal);
    stock.position.set(0, -0.03, -0.39);
    for (let s = 0; s < 4; s++) {
      const shell = new THREE.Mesh(wShotShellGeo, pm.tacRed);
      shell.position.set(0.072, 0.01, -0.06 + s * 0.042);
      gunGroup.add(shell);
    }
    if (weaponId === 'tac') {
      const optic = new THREE.Mesh(wArSightFrameGeo, pm.darkMetal);
      optic.position.set(0, 0.12, 0.06);
      const dot = new THREE.Mesh(wArDotGeo, sharedOpticDot);
      dot.position.set(0, 0.125, 0.06);
      gunGroup.add(optic, dot);
    }
    const strip = new THREE.Mesh(wStripGeo, accentMat);
    strip.position.set(0, 0.04, 0.02);
    gunGroup.add(body, rail, barrel, tube, pump, grip, stock, strip);
    gunGroup.position.set(0, gunPivotOffsetY, gunPivotOffsetZ);
    g.add(gunGroup);
  } else if (weaponId === 'smg') {
    const body = new THREE.Mesh(wSmgBodyGeo, pm.gunmetal);
    const suppressor = new THREE.Mesh(wSmgBarrelGeo, pm.darkMetal);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.02, 0.36);
    const mag = new THREE.Mesh(wSmgMagGeo, pm.silverMetal);
    mag.position.set(0, -0.18, 0.08);
    mag.rotation.x = 0.16;
    const grip = new THREE.Mesh(wArGripGeo, pm.darkMetal);
    grip.position.set(0, -0.115, -gunPivotOffsetZ);
    grip.rotation.x = -0.2;
    const foregrip = new THREE.Mesh(wArForegripGeo, pm.darkMetal);
    foregrip.position.set(0, -0.09, 0.22);
    const stock = new THREE.Mesh(wSmgStockGeo, pm.silverMetal);
    stock.position.set(0, 0.01, -0.31);
    const sight = new THREE.Mesh(wArSightFrameGeo, pm.darkMetal);
    sight.position.set(0, 0.105, 0.02);
    const dot = new THREE.Mesh(wArDotGeo, sharedOpticDot);
    dot.position.set(0, 0.11, 0.02);
    const strip = new THREE.Mesh(wStripGeo, accentMat);
    strip.scale.z = 0.65;
    strip.position.set(0, 0.025, 0);
    gunGroup.add(body, suppressor, mag, grip, foregrip, stock, sight, dot, strip);
    gunGroup.position.set(0, gunPivotOffsetY, gunPivotOffsetZ);
    g.add(gunGroup);
  } else if (weaponId === 'sniper') {
    const body = new THREE.Mesh(wSniperBodyGeo, pm.woodGrip);
    const barrel = new THREE.Mesh(wSniperBarrelGeo, pm.silverMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.032, 0.74);
    const muzzle = new THREE.Mesh(wArMuzzleGeo, pm.darkMetal);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.032, 1.18);
    const scope = new THREE.Mesh(wSniperScopeGeo, pm.darkMetal);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.145, 0.12);
    const scopeBell = new THREE.Mesh(wSniperScopeBellGeo, pm.darkMetal);
    scopeBell.rotation.x = Math.PI / 2;
    scopeBell.position.set(0, 0.145, 0.35);
    for (const rz of [-0.02, 0.22]) {
      const ring = new THREE.Mesh(wSniperRingGeo, pm.silverMetal);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.145, rz);
      gunGroup.add(ring);
    }
    const lens = new THREE.Mesh(wSniperLensGeo, pm.scopeGlass);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.145, 0.42);
    for (const s of [-1, 1]) {
      const bipod = new THREE.Mesh(wSniperBipodGeo, pm.gunmetal);
      bipod.position.set(s * 0.075, -0.09, 0.5);
      bipod.rotation.z = s * 0.32;
      bipod.rotation.x = 0.25;
      gunGroup.add(bipod);
    }
    const grip = new THREE.Mesh(wArGripGeo, pm.darkMetal);
    grip.position.set(0, -0.12, -gunPivotOffsetZ);
    grip.rotation.x = -0.22;
    const strip = new THREE.Mesh(wStripGeo, accentMat);
    strip.position.set(0, 0.03, 0.14);
    gunGroup.add(body, barrel, muzzle, scope, scopeBell, lens, grip, strip);
    gunGroup.position.set(0, gunPivotOffsetY, gunPivotOffsetZ);
    g.add(gunGroup);
  } else if (weaponId === 'mini' || weaponId === 'big') {
    const bottle = new THREE.Mesh(wPotionGeo, pm.shieldLiquid);
    bottle.position.set(0, 0.02, 0.04);
    const neck = new THREE.Mesh(wPotionNeckGeo, pm.shieldLiquid);
    neck.position.set(0, 0.2, 0.04);
    const cap = new THREE.Mesh(wPotionCapGeo, pm.silverMetal);
    cap.position.set(0, 0.25, 0.04);
    g.add(bottle, neck, cap);
  } else if (weaponId === 'chug') {
    const jug = new THREE.Mesh(wChugGeo, pm.chugBody);
    jug.position.set(0, 0.06, 0.05);
    const bandTop = new THREE.Mesh(wChugBandGeo, pm.chestTrim);
    bandTop.rotation.x = Math.PI / 2;
    bandTop.position.set(0, 0.19, 0.05);
    const bandBot = new THREE.Mesh(wChugBandGeo, pm.chestTrim);
    bandBot.rotation.x = Math.PI / 2;
    bandBot.position.set(0, -0.08, 0.05);
    const cap = new THREE.Mesh(wChugCapGeo, pm.silverMetal);
    cap.position.set(0, 0.27, 0.05);
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(wChugHandleGeo, pm.silverMetal);
      h.rotation.z = s * (Math.PI / 2);
      h.position.set(s * 0.17, 0.06, 0.05);
      g.add(h);
    }
    g.add(jug, bandTop, bandBot, cap);
  } else {
    const kit = new THREE.Mesh(wMedKitGeo, pm.medkitBody);
    const crossV = new THREE.Mesh(wMedCrossVGeo, pm.medkitCross);
    const crossH = new THREE.Mesh(wMedCrossHGeo, pm.medkitCross);
    const handle = new THREE.Mesh(wMedHandleGeo, pm.darkMetal);
    handle.position.y = 0.135;
    g.add(kit, crossV, crossH, handle);
  }
  return g;
}

export interface HumanoidAnimateOpts {
  speed?: number;
  isAiming?: boolean;
  isCrouching?: boolean;
  isSliding?: boolean;
  isKnocked?: boolean;
  isDead?: boolean;
  deathProgress?: number;
  strafeLean?: number;
  onGround?: boolean;
  isSkydiving?: boolean;
  skydivePitch?: number;
  skydiveBank?: number;
  isGliding?: boolean;
  isSwimming?: boolean;
  recoil?: number;
  pickaxeSwing?: number;
  reloading?: number;
  reloadTotal?: number;
  healing?: number;
  emoteTimer?: number;
  emoteId?: EmoteId;
  hitFlinch?: number;
  equipTimer?: number;
  pitch?: number;
  playFootsteps?: boolean;
  onStep?: () => void;
  squashY?: number;
}

export interface HumanoidRig {
  root: THREE.Group;
  hitboxes: RigHitboxPart[];
  headHitMesh: THREE.Mesh;
  bodyHitMesh: THREE.Mesh;
  setWeaponModel: (weaponId: WeaponId | null) => void;
  setHitFlash: (active: boolean) => void;
  animate: (dt: number, opts: HumanoidAnimateOpts) => void;
}

interface SkinMaterialSet {
  torsoMat: THREE.MeshStandardMaterial;
  shirtMat: THREE.MeshStandardMaterial;
  pantsMat: THREE.MeshStandardMaterial;
  skinMat: THREE.MeshStandardMaterial;
  hairMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
  visorMat: THREE.MeshStandardMaterial | null;
}

const skinMaterialByTex = new WeakMap<ProceduralTextures, Map<string, SkinMaterialSet>>();
const fallbackSkinMaterialMap = new Map<string, SkinMaterialSet>();

function getSkinMaterials(skinId: string, textures?: ProceduralTextures): SkinMaterialSet {
  let cache = fallbackSkinMaterialMap;
  if (textures) {
    let m = skinMaterialByTex.get(textures);
    if (!m) {
      m = new Map<string, SkinMaterialSet>();
      skinMaterialByTex.set(textures, m);
    }
    cache = m;
  }

  const existing = cache.get(skinId);
  if (existing) return existing;

  const reg = <T extends THREE.MeshStandardMaterial>(m: T): T =>
    textures ? textures.registerTierMaterial(m) : m;

  const skin = SKINS.find((s) => s.id === skinId) || SKINS[0];
  const makeFabricMat = (col: number, extraRough = 0) =>
    reg(
      new THREE.MeshPhysicalMaterial({
        color: col,
        map: textures?.fabric.map ?? null,
        normalMap: textures?.fabric.normalMap ?? null,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughnessMap: textures?.fabric.roughnessMap ?? null,
        metalnessMap: textures?.fabric.specularMap ?? null,
        roughness: skin.metallic ? 0.38 : Math.min(0.9, 0.72 + extraRough),
        metalness: skin.metallic ? 0.55 : 0.06,
        sheen: skin.metallic ? 0 : 0.18,
        sheenRoughness: 0.75,
        sheenColor: new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.22),
      }),
    );

  const makeArmorMat = (col: number, roughness = 0.48, metalness = 0.26) =>
    reg(
      new THREE.MeshStandardMaterial({
        color: col,
        map: textures?.armorHex.map ?? null,
        normalMap: textures?.armorHex.normalMap ?? null,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: textures?.armorHex.roughnessMap ?? null,
        metalnessMap: textures?.armorHex.specularMap ?? null,
        roughness: skin.metallic ? 0.32 : Math.max(0.48, roughness),
        metalness: skin.metallic ? 0.58 : Math.min(0.28, metalness),
      }),
    );

  const set: SkinMaterialSet = {
    torsoMat: makeArmorMat(skin.torso, 0.52, 0.2),
    shirtMat: makeFabricMat(skin.shirt, 0.06),
    pantsMat: makeFabricMat(skin.pants, 0.1),
    skinMat: reg(
      new THREE.MeshStandardMaterial({
        color: skin.skin,
        map: textures?.skinDetail.map ?? null,
        normalMap: textures?.skinDetail.normalMap ?? null,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughnessMap: textures?.skinDetail.roughnessMap ?? null,
        metalnessMap: textures?.skinDetail.specularMap ?? null,
        roughness: 0.66,
        metalness: 0.02,
      }),
    ),
    hairMat: makeFabricMat(skin.hair, 0.06),
    accentMat: makeArmorMat(skin.accent, 0.44, 0.28),
    visorMat: skin.visor
      ? reg(
          new THREE.MeshPhysicalMaterial({
            color: skin.visor,
            normalMap: textures?.gunmetal.normalMap ?? null,
            emissive: skin.visor,
            emissiveIntensity: 0.28,
            roughness: 0.24,
            metalness: 0.34,
            clearcoat: 0.15,
            clearcoatRoughness: 0.25,
          }),
        )
      : null,
  };
  cache.set(skinId, set);
  return set;
}

function createLatheSegment(profile: Array<[number, number]>, segments = 20): THREE.LatheGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.computeVertexNormals();
  return geo;
}

const charShadowGeo = new THREE.CircleGeometry(0.76, 20);
// Muscular sculpted thigh (height ~0.49 centered around 0)
const charThighGeo = createLatheSegment([
  [0.105, -0.245],
  [0.118, -0.15],
  [0.145, 0.04],
  [0.155, 0.19],
  [0.142, 0.245],
]);
const charKneeGeo = new THREE.SphereGeometry(0.125, 14, 12);
// Contoured athletic calf/shin (height ~0.38 centered around 0)
const charShinGeo = createLatheSegment([
  [0.084, -0.19],
  [0.094, -0.09],
  [0.124, 0.05],
  [0.118, 0.14],
  [0.112, 0.19],
]);
const charShinGuardGeo = createBeveledRectGeo(0.17, 0.25, 0.1, 0.04, 0.02);
const charBootGeo = new THREE.CapsuleGeometry(0.11, 0.18, 8, 14);
const charBootSoleGeo = createBeveledRectGeo(0.23, 0.065, 0.38, 0.05, 0.015);
const charBeltGeo = new THREE.CylinderGeometry(0.355, 0.345, 0.13, 20);
const charPelvisGeo = createLatheSegment([
  [0.24, -0.125],
  [0.29, -0.04],
  [0.325, 0.06],
  [0.31, 0.125],
]);
const charPouchGeo = createBeveledRectGeo(0.13, 0.16, 0.11, 0.03, 0.015);
// V-tapered athletic chest silhouette (height ~0.78 centered around 0)
const charChestGeo = createLatheSegment([
  [0.295, -0.39],
  [0.325, -0.22],
  [0.365, -0.02],
  [0.425, 0.19],
  [0.415, 0.32],
  [0.33, 0.39],
]);
const charArmorPlateGeo = createBeveledRectGeo(0.5, 0.44, 0.12, 0.08, 0.03);
const charChestPocketGeo = createBeveledRectGeo(0.14, 0.14, 0.06, 0.025, 0.012);
const charStrapGeo = new THREE.BoxGeometry(0.085, 0.72, 0.46);
const charCollarGeo = new THREE.TorusGeometry(0.21, 0.065, 10, 20);
const charPackGeo = createBeveledRectGeo(0.42, 0.5, 0.18, 0.07, 0.03);
const charPackThrusterGeo = new THREE.CylinderGeometry(0.055, 0.075, 0.2, 12);
const charPackBeaconGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
const charRankPipGeo = new THREE.BoxGeometry(0.18, 0.1, 0.045);
const charNeckGeo = new THREE.CylinderGeometry(0.11, 0.145, 0.18, 16);

const charHeadGeo = new THREE.SphereGeometry(0.235, 22, 18);
const charJawGeo = new THREE.CylinderGeometry(0.165, 0.105, 0.17, 16);
const charNoseGeo = new THREE.CapsuleGeometry(0.026, 0.055, 6, 10);
const charEarGeo = new THREE.SphereGeometry(0.048, 10, 8);
const charCommsEarGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.05, 14);
const charLipGeo = new THREE.CapsuleGeometry(0.014, 0.055, 4, 8);
const charHelmetDomeGeo = new THREE.SphereGeometry(0.268, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
const charHelmetBrimGeo = createBeveledRectGeo(0.38, 0.055, 0.16, 0.03, 0.012);
const charVisorGeo = new THREE.CylinderGeometry(0.238, 0.238, 0.105, 18, 1, false, -Math.PI * 0.38, Math.PI * 0.76);
const charEyeWhiteGeo = new THREE.SphereGeometry(0.038, 12, 10);
const charEyeIrisGeo = new THREE.SphereGeometry(0.024, 10, 8);
const charEyePupilGeo = new THREE.SphereGeometry(0.014, 8, 8);
const charBrowGeo = new THREE.CapsuleGeometry(0.014, 0.068, 4, 8);
const charHairCapGeo = new THREE.SphereGeometry(0.244, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
const charHairLockGeo = new THREE.CapsuleGeometry(0.062, 0.16, 6, 12);
const charHairBackGeo = new THREE.SphereGeometry(0.19, 14, 12);

const charPauldronGeo = new THREE.SphereGeometry(0.165, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.68);
const charUpperArmGeo = createLatheSegment([
  [0.088, -0.195],
  [0.105, -0.06],
  [0.116, 0.07],
  [0.104, 0.195],
]);
const charElbowGeo = new THREE.SphereGeometry(0.102, 12, 10);
const charForearmGeo = createLatheSegment([
  [0.068, -0.18],
  [0.082, -0.05],
  [0.098, 0.09],
  [0.088, 0.18],
]);
const charBracerGeo = new THREE.CylinderGeometry(0.098, 0.082, 0.18, 14);
const charHandGeo = new THREE.SphereGeometry(0.078, 12, 10);
const charGloveGeo = new THREE.BoxGeometry(0.115, 0.125, 0.115);
const charThumbGeo = new THREE.CapsuleGeometry(0.022, 0.045, 4, 8);
const charPirateBrimGeo = new THREE.CylinderGeometry(0.46, 0.48, 0.055, 20);
const charPirateCrownGeo = new THREE.CylinderGeometry(0.23, 0.27, 0.24, 16);
const charCrownGeo = new THREE.CylinderGeometry(0.25, 0.22, 0.22, 8);
const charCapBrimGeo = createBeveledRectGeo(0.32, 0.04, 0.22, 0.03, 0.01);
const charHaloGeo = new THREE.TorusGeometry(0.27, 0.026, 8, 24);
const charBuckleGeo = new THREE.BoxGeometry(0.16, 0.12, 0.06);
const charHolsterGeo = createBeveledRectGeo(0.12, 0.22, 0.14, 0.025, 0.012);

const hitHeadGeo = new THREE.SphereGeometry(0.32, 10, 8);
const hitChestGeo = new THREE.BoxGeometry(0.84, 0.62, 0.54);
const hitPelvisGeo = new THREE.BoxGeometry(0.76, 0.38, 0.48);
const hitLimbArmGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.78, 8);
const hitLimbLegGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.92, 8);

const contactShadowMatCache = new WeakMap<THREE.Texture, THREE.MeshBasicMaterial>();
function getContactShadowMat(tex: THREE.Texture): THREE.MeshBasicMaterial {
  let mat = contactShadowMatCache.get(tex);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    });
    contactShadowMatCache.set(tex, mat);
  }
  return mat;
}

export function createHumanoidRig(
  skinId: string,
  contactShadowTex?: THREE.Texture,
  tier: 'player' | BotSkillTier = 'player',
  textures?: ProceduralTextures,
): HumanoidRig {
  const skin = SKINS.find((s) => s.id === skinId) || SKINS[0];
  const mats = getSkinMaterials(skin.id, textures);
  const pm = getSharedPropMats(textures);
  const root = new THREE.Group();

  const flashableMeshes: Array<{ mesh: THREE.Mesh; baseMat: THREE.Material }> = [];
  const regMesh = (m: THREE.Mesh) => {
    flashableMeshes.push({ mesh: m, baseMat: m.material as THREE.Material });
    return m;
  };

  if (contactShadowTex) {
    const shadowDisc = new THREE.Mesh(charShadowGeo, getContactShadowMat(contactShadowTex));
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.025;
    root.add(shadowDisc);
  }

  const hitboxes: RigHitboxPart[] = [];
  const addHitbox = (parent: THREE.Object3D, geo: THREE.BufferGeometry, y: number, z: number, zone: HitboxZone, multiplier: number) => {
    const m = new THREE.Mesh(geo, invisibleHitMat);
    m.position.set(0, y, z);
    m.userData.hitboxZone = zone;
    m.userData.damageMult = multiplier;
    parent.add(m);
    hitboxes.push({ mesh: m, zone, multiplier });
    return m;
  };

  const animRoot = new THREE.Group();
  root.add(animRoot);

  function makeLeg(side: number) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.21, 0.96, 0);

    const thigh = regMesh(new THREE.Mesh(charThighGeo, mats.pantsMat));
    thigh.position.y = -0.24;
    thigh.castShadow = true;
    hip.add(thigh);

    const kneePad = regMesh(new THREE.Mesh(charKneeGeo, mats.accentMat));
    kneePad.position.set(0, -0.47, 0.035);
    hip.add(kneePad);

    const knee = new THREE.Group();
    knee.position.y = -0.48;
    hip.add(knee);

    const shin = regMesh(new THREE.Mesh(charShinGeo, mats.pantsMat));
    shin.position.y = -0.17;
    shin.castShadow = true;
    knee.add(shin);

    const shinGuard = regMesh(new THREE.Mesh(charShinGuardGeo, mats.accentMat));
    shinGuard.position.set(0, -0.17, 0.075);
    knee.add(shinGuard);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.37, 0.01);
    knee.add(ankle);

    const boot = regMesh(new THREE.Mesh(charBootGeo, pm.boot));
    boot.rotation.x = Math.PI / 2;
    boot.scale.set(1.05, 1.15, 0.85);
    boot.position.set(0, 0, 0.05);
    ankle.add(boot);

    const sole = new THREE.Mesh(charBootSoleGeo, pm.bootSole);
    sole.position.set(0, -0.08, 0.05);
    ankle.add(sole);

    if (side === 1) {
      const holster = regMesh(new THREE.Mesh(charHolsterGeo, pm.boot));
      holster.position.set(0.14, -0.22, 0.02);
      hip.add(holster);
    }

    addHitbox(hip, hitLimbLegGeo, -0.44, 0, 'leg', 0.75);

    return { hip, knee, ankle };
  }

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  animRoot.add(leftLeg.hip, rightLeg.hip);

  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.96;
  animRoot.add(bodyPivot);

  const pelvisMesh = regMesh(new THREE.Mesh(charPelvisGeo, mats.pantsMat));
  pelvisMesh.position.y = 0.05;
  pelvisMesh.scale.set(1.06, 1, 0.72);
  bodyPivot.add(pelvisMesh);

  const belt = regMesh(new THREE.Mesh(charBeltGeo, mats.accentMat));
  belt.position.y = 0.11;
  belt.scale.set(1.06, 1, 0.68);
  bodyPivot.add(belt);

  const buckle = regMesh(new THREE.Mesh(charBuckleGeo, pm.silverMetal));
  buckle.position.set(0, 0.11, 0.235);
  bodyPivot.add(buckle);

  for (const s of [-1, 1]) {
    const pouch = regMesh(new THREE.Mesh(charPouchGeo, pm.boot));
    pouch.position.set(s * 0.39, 0.1, 0.06);
    bodyPivot.add(pouch);
  }

  const chest = regMesh(new THREE.Mesh(charChestGeo, mats.torsoMat));
  chest.position.y = 0.56;
  chest.scale.set(1.06, 1, 0.68);
  chest.castShadow = true;
  chest.receiveShadow = true;
  bodyPivot.add(chest);

  const armorPlate = regMesh(new THREE.Mesh(charArmorPlateGeo, mats.accentMat));
  armorPlate.position.set(0, 0.6, 0.185);
  armorPlate.scale.set(0.96, 1.02, 0.9);
  armorPlate.castShadow = true;
  bodyPivot.add(armorPlate);

  const backArmorPlate = regMesh(new THREE.Mesh(charArmorPlateGeo, mats.accentMat));
  backArmorPlate.position.set(0, 0.6, -0.165);
  backArmorPlate.scale.set(0.96, 1.0, 0.84);
  bodyPivot.add(backArmorPlate);

  for (const s of [-1, 1]) {
    const magPocket = regMesh(new THREE.Mesh(charChestPocketGeo, mats.accentMat));
    magPocket.position.set(s * 0.125, 0.46, 0.26);
    bodyPivot.add(magPocket);

    const strap = regMesh(new THREE.Mesh(charStrapGeo, mats.accentMat));
    strap.position.set(s * 0.17, 0.6, 0);
    bodyPivot.add(strap);
  }

  if (tier === 'pro' || tier === 'veteran') {
    const badge = new THREE.Mesh(charRankPipGeo, tier === 'pro' ? pm.proBadge : pm.veteranBadge);
    badge.position.set(0, 0.72, 0.275);
    bodyPivot.add(badge);
  }

  const collar = regMesh(new THREE.Mesh(charCollarGeo, mats.accentMat));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.94;
  bodyPivot.add(collar);

  const backpack = regMesh(new THREE.Mesh(charPackGeo, mats.accentMat));
  backpack.position.set(0, 0.56, -0.3);
  backpack.castShadow = true;
  bodyPivot.add(backpack);

  for (const s of [-1, 1]) {
    const thruster = new THREE.Mesh(charPackThrusterGeo, pm.gunmetal);
    thruster.position.set(s * 0.13, 0.36, -0.33);
    bodyPivot.add(thruster);
  }

  const beacon = new THREE.Mesh(charPackBeaconGeo, pm.silverMetal);
  beacon.position.set(0.17, 0.94, -0.3);
  bodyPivot.add(beacon);

  const gliderGroup = new THREE.Group();
  gliderGroup.position.set(0, 2.55, 0);
  gliderGroup.visible = false;
  const wingCenter = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.08, 1.08), pm.gliderWing);
  const wingLeft = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.96), pm.gliderWing);
  wingLeft.position.set(-1.72, -0.16, -0.1);
  wingLeft.rotation.z = 0.24;
  const wingRight = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.96), pm.gliderWing);
  wingRight.position.set(1.72, -0.16, -0.1);
  wingRight.rotation.z = -0.24;
  const gliderBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8), pm.silverMetal);
  gliderBar.rotation.z = Math.PI / 2;
  gliderBar.position.set(0, -0.55, 0.22);
  gliderGroup.add(wingCenter, wingLeft, wingRight, gliderBar);
  animRoot.add(gliderGroup);

  const chestHitMesh = addHitbox(bodyPivot, hitChestGeo, 0.62, 0, 'chest', 1.0);
  addHitbox(bodyPivot, hitPelvisGeo, 0.16, 0, 'pelvis', 0.9);

  const neck = regMesh(new THREE.Mesh(charNeckGeo, mats.skinMat));
  neck.position.y = 0.97;
  bodyPivot.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.0;
  bodyPivot.add(headGroup);

  const head = regMesh(new THREE.Mesh(charHeadGeo, mats.skinMat));
  head.scale.set(0.88, 1.06, 0.96);
  head.position.y = 0.23;
  head.castShadow = true;
  headGroup.add(head);

  const jaw = regMesh(new THREE.Mesh(charJawGeo, mats.skinMat));
  jaw.scale.set(0.9, 1.0, 1.04);
  jaw.position.set(0, 0.095, 0.03);
  headGroup.add(jaw);

  const nose = regMesh(new THREE.Mesh(charNoseGeo, mats.skinMat));
  nose.rotation.x = -0.34;
  nose.position.set(0, 0.21, 0.215);
  headGroup.add(nose);

  const lip = regMesh(new THREE.Mesh(charLipGeo, mats.skinMat));
  lip.rotation.z = Math.PI / 2;
  lip.position.set(0, 0.12, 0.185);
  headGroup.add(lip);

  for (const s of [-1, 1]) {
    const ear = regMesh(new THREE.Mesh(charEarGeo, mats.skinMat));
    ear.scale.set(0.55, 1.35, 0.95);
    ear.position.set(s * 0.205, 0.22, -0.01);
    headGroup.add(ear);

    if (skin.visor || skin.hat === 'helmet') {
      const comms = new THREE.Mesh(charCommsEarGeo, mats.accentMat);
      comms.rotation.z = Math.PI / 2;
      comms.position.set(s * 0.22, 0.22, -0.01);
      headGroup.add(comms);
    }
  }

  if (mats.visorMat) {
    const visor = new THREE.Mesh(charVisorGeo, mats.visorMat);
    visor.position.set(0, 0.255, 0.01);
    headGroup.add(visor);
  } else {
    const irisMat = new THREE.MeshStandardMaterial({ color: skin.accent, roughness: 0.25 });
    for (const s of [-1, 1]) {
      const sclera = new THREE.Mesh(charEyeWhiteGeo, sharedEyeHighlightMat);
      sclera.scale.set(1.05, 0.72, 0.55);
      sclera.position.set(s * 0.082, 0.255, 0.192);
      const iris = new THREE.Mesh(charEyeIrisGeo, irisMat);
      iris.scale.set(1, 1, 0.55);
      iris.position.set(s * 0.082, 0.255, 0.208);
      const pupil = new THREE.Mesh(charEyePupilGeo, sharedEyeMat);
      pupil.scale.set(1, 1, 0.6);
      pupil.position.set(s * 0.082, 0.255, 0.215);
      const brow = new THREE.Mesh(charBrowGeo, mats.hairMat);
      brow.rotation.z = Math.PI / 2 + s * -0.1;
      brow.position.set(s * 0.084, 0.305, 0.2);
      headGroup.add(sclera, iris, pupil, brow);
    }
  }

  if (skin.hat === 'pirate') {
    const brim = regMesh(new THREE.Mesh(charPirateBrimGeo, pm.pirateBrim));
    brim.position.y = 0.43;
    brim.scale.set(1.0, 1.0, 0.88);
    const crown = regMesh(new THREE.Mesh(charPirateCrownGeo, pm.pirateCrown));
    crown.position.y = 0.56;
    headGroup.add(brim, crown);
  } else if (skin.hat === 'crown') {
    const crown = new THREE.Mesh(charCrownGeo, pm.crownGold);
    crown.position.y = 0.52;
    headGroup.add(crown);
  } else if (skin.hat === 'cap') {
    const dome = regMesh(new THREE.Mesh(charHairCapGeo, mats.accentMat));
    dome.scale.set(1.02, 1.04, 1.02);
    dome.position.y = 0.27;
    const capBrim = regMesh(new THREE.Mesh(charCapBrimGeo, mats.accentMat));
    capBrim.position.set(0, 0.33, 0.21);
    capBrim.rotation.x = 0.08;
    headGroup.add(dome, capBrim);
  } else if (skin.hat === 'halo') {
    const hairCap = regMesh(new THREE.Mesh(charHairCapGeo, mats.hairMat));
    hairCap.scale.set(0.92, 1.03, 1.0);
    hairCap.position.set(0, 0.25, -0.02);
    const halo = new THREE.Mesh(charHaloGeo, pm.crownGold);
    halo.rotation.x = Math.PI / 2 - 0.12;
    halo.position.set(0, 0.62, -0.02);
    headGroup.add(hairCap, halo);
  } else if (skin.hat === 'helmet' || skin.hat === 'hood') {
    const dome = regMesh(new THREE.Mesh(charHelmetDomeGeo, mats.hairMat));
    dome.position.y = 0.26;
    const helmBrim = regMesh(new THREE.Mesh(charHelmetBrimGeo, mats.accentMat));
    helmBrim.position.set(0, 0.34, 0.18);
    headGroup.add(dome, helmBrim);
  } else {
    const hairCap = regMesh(new THREE.Mesh(charHairCapGeo, mats.hairMat));
    hairCap.scale.set(0.92, 1.03, 1.0);
    hairCap.position.set(0, 0.25, -0.02);
    hairCap.rotation.x = -0.18;
    headGroup.add(hairCap);

    const hairWave = regMesh(new THREE.Mesh(charHairLockGeo, mats.hairMat));
    hairWave.scale.set(2.3, 0.72, 1.25);
    hairWave.position.set(0.02, 0.41, 0.07);
    hairWave.rotation.set(1.22, 0, -0.22);
    headGroup.add(hairWave);

    const hairSide = regMesh(new THREE.Mesh(charHairLockGeo, mats.hairMat));
    hairSide.scale.set(1.45, 0.65, 1.05);
    hairSide.position.set(-0.07, 0.38, 0.08);
    hairSide.rotation.set(1.15, 0, 0.35);
    headGroup.add(hairSide);

    const hairBack = regMesh(new THREE.Mesh(charHairBackGeo, mats.hairMat));
    hairBack.scale.set(1.04, 0.92, 0.68);
    hairBack.position.set(0, 0.27, -0.14);
    headGroup.add(hairBack);
  }

  const headHitMesh = addHitbox(headGroup, hitHeadGeo, 0.24, 0, 'head', 1.45);

  function makeArm(side: number) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.45, 0.87, 0);

    const pauldron = regMesh(new THREE.Mesh(charPauldronGeo, mats.accentMat));
    pauldron.scale.set(0.94, 0.72, 0.92);
    pauldron.position.y = 0.02;
    pauldron.rotation.z = side * -0.32;
    shoulder.add(pauldron);

    const upper = regMesh(new THREE.Mesh(charUpperArmGeo, mats.shirtMat));
    upper.position.y = -0.2;
    upper.castShadow = true;
    shoulder.add(upper);

    const elbowJoint = regMesh(new THREE.Mesh(charElbowGeo, mats.accentMat));
    elbowJoint.position.y = -0.39;
    shoulder.add(elbowJoint);

    const elbow = new THREE.Group();
    elbow.position.y = -0.4;
    shoulder.add(elbow);

    const forearm = regMesh(new THREE.Mesh(charForearmGeo, mats.skinMat));
    forearm.position.y = -0.18;
    elbow.add(forearm);

    const bracer = regMesh(new THREE.Mesh(charBracerGeo, mats.accentMat));
    bracer.position.y = -0.21;
    elbow.add(bracer);

    const hand = regMesh(new THREE.Mesh(charHandGeo, mats.skinMat));
    hand.scale.set(0.95, 1.2, 0.82);
    hand.position.y = -0.36;
    elbow.add(hand);

    const glove = regMesh(new THREE.Mesh(charGloveGeo, pm.boot));
    glove.position.set(0, -0.355, 0.005);
    elbow.add(glove);

    const thumb = regMesh(new THREE.Mesh(charThumbGeo, mats.skinMat));
    thumb.position.set(-side * 0.065, -0.35, 0.045);
    thumb.rotation.z = side * 0.55;
    elbow.add(thumb);

    addHitbox(shoulder, hitLimbArmGeo, -0.36, 0, 'arm', 0.75);

    return { shoulder, elbow };
  }

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  bodyPivot.add(leftArm.shoulder, rightArm.shoulder);

  // Skydive aero contrail ribbons anchored behind hands & boots
  const skydiveContrailGeo = new THREE.ConeGeometry(0.055, 1.85, 6);
  const skydiveContrailMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  const makeTrail = (x: number, y: number, z: number) => {
    const m = new THREE.Mesh(skydiveContrailGeo, skydiveContrailMat);
    m.position.set(x, y, z);
    m.rotation.x = Math.PI;
    m.visible = false;
    return m;
  };
  const handTrailL = makeTrail(0, -1.28, -0.05);
  const handTrailR = makeTrail(0, -1.28, -0.05);
  leftArm.elbow.add(handTrailL);
  rightArm.elbow.add(handTrailR);
  const bootTrailL = makeTrail(0, -0.82, -0.18);
  const bootTrailR = makeTrail(0, -0.82, -0.18);
  leftLeg.ankle.add(bootTrailL);
  rightLeg.ankle.add(bootTrailR);
  const skydiveContrails = [handTrailL, handTrailR, bootTrailL, bootTrailR];

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.36, 0.015);
  rightArm.elbow.add(weaponMount);

  let currentWeaponId: WeaponId | null = null;
  function setWeaponModel(wId: WeaponId | null) {
    if (wId === currentWeaponId) return;
    currentWeaponId = wId;
    while (weaponMount.children.length) weaponMount.remove(weaponMount.children[0]);
    if (wId) weaponMount.add(createWeaponModel(wId, undefined, textures));
  }
  setWeaponModel('pickaxe');

  let stepPhase = 0;
  let wasOnGround = true;
  let landingDip = 0;

  return {
    root,
    hitboxes,
    headHitMesh,
    bodyHitMesh: chestHitMesh,
    setWeaponModel,
    setHitFlash(active: boolean) {
      for (const item of flashableMeshes) {
        item.mesh.material = active ? sharedFlashMat : item.baseMat;
      }
    },
    animate(dt: number, opts: HumanoidAnimateOpts) {
      const {
        speed = 0,
        isAiming = false,
        isCrouching = false,
        isSliding = false,
        isKnocked = false,
        isDead = false,
        deathProgress = 0,
        strafeLean = 0,
        onGround = true,
        isSkydiving = false,
        skydivePitch = 0,
        skydiveBank = 0,
        isGliding = false,
        isSwimming = false,
        recoil = 0,
        pickaxeSwing = 0,
        reloading = 0,
        reloadTotal = 1.5,
        healing = 0,
        emoteTimer = 0,
        emoteId = 'boogie',
        hitFlinch = 0,
        equipTimer = 0,
        pitch = 0,
        playFootsteps = false,
        onStep,
        squashY = 1,
      } = opts;

      const t = performance.now() * 0.004;
      const lerpF = Math.min(1, dt * 18);

      if (onGround && !wasOnGround && !isSwimming && !isSkydiving && !isGliding) {
        landingDip = 1.0;
      }
      wasOnGround = onGround;
      if (landingDip > 0) landingDip = Math.max(0, landingDip - dt * 5.2);

      gliderGroup.visible = isGliding && !isDead && !isKnocked;
      if (isGliding) {
        gliderGroup.rotation.z = Math.sin(t * 1.4) * 0.08 - skydiveBank * 0.25;
      }
      const showContrails = isSkydiving && !isGliding && !isDead && !isKnocked;
      for (let i = 0; i < skydiveContrails.length; i++) {
        const trail = skydiveContrails[i];
        trail.visible = showContrails;
        if (showContrails) {
          const diveScale = skydivePitch > 0.2 ? 1.45 : 0.92;
          trail.scale.set(1, diveScale + Math.sin(t * 5 + i) * 0.14, 1);
        }
      }
      weaponMount.visible = !isDead && !isKnocked && !isSkydiving && !isGliding && !isSwimming && emoteTimer <= 0;

      const invSq = 1 / Math.sqrt(Math.max(0.6, squashY));
      animRoot.scale.set(
        THREE.MathUtils.lerp(animRoot.scale.x, invSq, lerpF),
        THREE.MathUtils.lerp(animRoot.scale.y, squashY, lerpF),
        THREE.MathUtils.lerp(animRoot.scale.z, invSq, lerpF),
      );

      let targetAnimTiltX = 0;
      let targetAnimTiltZ = 0;
      let targetAnimY = 0;
      let targetBodyY = isCrouching ? 0.68 : 0.96;
      let targetBodyTiltX = 0;
      let targetBodyTiltZ = THREE.MathUtils.clamp(strafeLean * 0.14, -0.18, 0.18);
      let targetBodyYaw = 0;
      let targetHeadTiltX = THREE.MathUtils.clamp(-pitch * 0.55 - hitFlinch * 0.28, -0.5, 0.5);
      let targetHeadYaw = 0;
      let targetHeadTiltZ = -targetBodyTiltZ * 0.55;
      let lHipX = 0;
      let rHipX = 0;
      let lKneeX = 0;
      let rKneeX = 0;
      let lAnkleX = 0;
      let rAnkleX = 0;
      let lShX = -0.2;
      let rShX = -0.62;
      let lElbX = -0.4;
      let rElbX = -0.78;
      let lShZ = 0.08;
      let rShZ = -0.08;
      let lShY = 0;
      let rShY = 0;
      let wpnRotX = 0;
      let wpnRotY = 0;
      let wpnRotZ = 0;
      let wpnPosZ = 0.015;
      const isTwoHandGun =
        currentWeaponId === 'ar' ||
        currentWeaponId === 'pump' ||
        currentWeaponId === 'tac' ||
        currentWeaponId === 'smg' ||
        currentWeaponId === 'sniper';

      if (isDead) {
        const dp = THREE.MathUtils.clamp(deathProgress, 0, 1);
        const ease = 1 - Math.pow(1 - dp, 2.2);
        targetAnimY = ease * -0.58;
        targetAnimTiltX = ease * -1.42;
        targetAnimTiltZ = ease * 0.24;
        targetBodyY = 0.96 - ease * 0.18;
        targetBodyTiltX = ease * 0.22;
        targetHeadTiltX = ease * 0.45;
        lHipX = ease * -0.35;
        rHipX = ease * 0.25;
        lKneeX = ease * 0.72;
        rKneeX = ease * 0.35;
        lShX = -0.45 * ease;
        rShX = -0.2 * ease;
        lShZ = 0.85 * ease;
        rShZ = -0.92 * ease;
        lElbX = -0.35 * ease;
        rElbX = -0.25 * ease;
      } else if (isKnocked) {
        const crawlCycle = speed > 0.25 ? t * 3.1 : t * 0.55;
        const crawl = speed > 0.25 ? Math.sin(crawlCycle) : 0;
        targetAnimY = -0.34;
        targetAnimTiltX = 0.88;
        targetBodyY = 0.62;
        targetBodyTiltX = 0.24;
        targetBodyTiltZ = crawl * 0.08;
        targetHeadTiltX = -0.78 + Math.sin(t * 1.8) * 0.06;
        lHipX = -0.82 + crawl * 0.26;
        rHipX = -0.82 - crawl * 0.26;
        lKneeX = 1.45;
        rKneeX = 1.45;
        lAnkleX = 0.45;
        rAnkleX = 0.45;
        lShX = -1.65 - crawl * 0.34;
        rShX = -1.65 + crawl * 0.34;
        lShZ = 0.18;
        rShZ = -0.18;
        lElbX = -0.35;
        rElbX = -0.35;
      } else if (isSliding) {
        targetAnimY = -0.22;
        targetBodyY = 0.48;
        targetBodyTiltX = -0.34;
        targetBodyTiltZ = 0.12;
        targetBodyYaw = -0.24;
        targetHeadTiltX += 0.22;
        targetHeadYaw = 0.24;
        // Front knee tucked, trailing leg extended along slide trail
        lHipX = -1.25;
        lKneeX = 1.55;
        lAnkleX = -0.3;
        rHipX = 0.55;
        rKneeX = 0.22;
        rAnkleX = 0.45;
        if (isTwoHandGun) {
          lShX = -0.95;
          lShY = 0.55;
          lShZ = -0.22;
          lElbX = -0.78;
          rShX = -0.82;
          rShY = -0.14;
          rElbX = -0.75;
        } else {
          lShX = 0.48;
          lShZ = 0.72;
          lElbX = -0.35;
          rShX = -0.68;
          rElbX = -0.65;
        }
      } else if (isSkydiving) {
        const diveFast = skydivePitch > 0.25;
        targetAnimY = 0.36 + Math.sin(t * 2.8) * 0.08;
        targetAnimTiltX = (diveFast ? 1.32 : 0.88) + Math.sin(t * 2.1) * 0.05;
        targetAnimTiltZ = -skydiveBank * 0.42 + Math.sin(t * 2.2) * 0.06;
        targetBodyTiltZ = -skydiveBank * 0.22;
        targetHeadTiltX = diveFast ? -0.92 : -0.68;
        if (diveFast) {
          // Streamlined nose-down tuck
          lShX = 1.02;
          rShX = 1.02;
          lShZ = 0.32 + Math.sin(t * 4) * 0.06;
          rShZ = -0.32 - Math.cos(t * 4) * 0.06;
          lElbX = -0.22;
          rElbX = -0.22;
          lHipX = 0.14 + Math.sin(t * 4.2) * 0.06;
          rHipX = 0.14 - Math.sin(t * 4.2) * 0.06;
          lKneeX = 0.24;
          rKneeX = 0.24;
        } else {
          // Flared X air-brake skydiving stance
          lShX = -0.62;
          rShX = -0.62;
          lShZ = 1.24 + Math.sin(t * 3.2) * 0.12;
          rShZ = -1.24 - Math.cos(t * 3.2) * 0.12;
          lElbX = -0.45;
          rElbX = -0.45;
          lHipX = 0.3 + Math.sin(t * 3.5) * 0.12;
          rHipX = 0.3 - Math.sin(t * 3.5) * 0.12;
          lKneeX = 0.68;
          rKneeX = 0.68;
        }
      } else if (isSwimming) {
        const strokeFreq = speed > 0.6 ? 0.011 : 0.0045;
        const st = performance.now() * strokeFreq;
        targetAnimY = -0.35 + Math.sin(st * 1.6) * 0.08;
        targetAnimTiltX = speed > 0.6 ? 1.15 : 0.35;
        targetHeadTiltX = speed > 0.6 ? -0.95 : -0.15;

        if (speed > 0.6) {
          lShX = -Math.PI * 0.55 + Math.sin(st) * 1.35;
          rShX = -Math.PI * 0.55 - Math.sin(st) * 1.35;
          lShZ = 0.35 + Math.cos(st) * 0.35;
          rShZ = -0.35 - Math.cos(st) * 0.35;
          lElbX = -0.35 - Math.max(0, Math.cos(st)) * 0.7;
          rElbX = -0.35 - Math.max(0, -Math.cos(st)) * 0.7;
          lHipX = Math.sin(st * 2.2) * 0.52;
          rHipX = -Math.sin(st * 2.2) * 0.52;
          lKneeX = 0.28 + Math.max(0, Math.sin(st * 2.2)) * 0.35;
          rKneeX = 0.28 + Math.max(0, -Math.sin(st * 2.2)) * 0.35;
          targetBodyYaw = Math.cos(st) * 0.24;
        } else {
          lShZ = 0.75 + Math.sin(st * 2) * 0.35;
          rShZ = -0.75 - Math.sin(st * 2) * 0.35;
          lShX = -0.65;
          rShX = -0.65;
          lHipX = Math.sin(st * 2.4) * 0.38;
          rHipX = -Math.sin(st * 2.4) * 0.38;
          lKneeX = 0.55;
          rKneeX = 0.55;
        }
      } else if (emoteTimer > 0) {
        const d = performance.now() * 0.011;
        if (emoteId === 'floss') {
          const swing = Math.sin(d * 2.4);
          targetBodyTiltZ = -swing * 0.16;
          targetBodyY = 0.94 + Math.abs(swing) * 0.06;
          lShZ = 0.55 + swing * 0.85;
          rShZ = -0.55 + swing * 0.85;
          lShX = swing > 0 ? 0.55 : -0.65;
          rShX = swing > 0 ? -0.65 : 0.55;
          lHipX = swing * 0.14;
          rHipX = -swing * 0.14;
        } else if (emoteId === 'robot') {
          const step = Math.floor(d * 0.85) % 4;
          targetBodyY = step % 2 === 0 ? 0.96 : 0.9;
          targetBodyYaw = step === 1 ? 0.45 : step === 3 ? -0.45 : 0;
          lShX = step === 0 ? -1.55 : step === 2 ? -0.35 : -1.1;
          rShX = step === 1 ? -1.55 : step === 3 ? -0.35 : -1.1;
          lElbX = step % 2 === 0 ? -1.4 : -0.2;
          rElbX = step % 2 === 1 ? -1.4 : -0.2;
          lShZ = 0.35;
          rShZ = -0.35;
          targetHeadTiltX = step % 2 === 0 ? -0.25 : 0.2;
        } else if (emoteId === 'spin') {
          targetBodyYaw = d * 2.8;
          targetBodyY = 0.98 + Math.abs(Math.sin(d * 1.8)) * 0.12;
          lShZ = 1.35;
          rShZ = -1.35;
          lShX = -0.4;
          rShX = -0.4;
          lHipX = Math.sin(d * 2.2) * 0.48;
          rHipX = -Math.sin(d * 2.2) * 0.48;
          lKneeX = 0.55;
        } else if (emoteId === 'shred') {
          targetBodyYaw = -0.42;
          targetBodyTiltX = -0.18 + Math.sin(d * 2.2) * 0.08;
          lShX = -1.15;
          lElbX = -0.85;
          lShZ = 0.35;
          rShX = -0.65 + Math.sin(d * 4.5) * 0.32;
          rElbX = -1.15 + Math.cos(d * 4.5) * 0.35;
          lHipX = -0.35;
          rHipX = 0.35;
          rKneeX = 0.4;
          targetHeadTiltX = Math.sin(d * 2.2) * 0.3;
        } else if (emoteId === 'pirate') {
          targetBodyY = 0.96 + Math.abs(Math.sin(d * 2.4)) * 0.14;
          targetBodyTiltZ = Math.sin(d * 1.2) * 0.16;
          lShX = -1.4;
          lElbX = -1.2;
          lShZ = 0.45;
          rShX = -1.9 + Math.sin(d * 2.4) * 0.4;
          rShZ = -0.5;
          lHipX = Math.max(0, Math.sin(d * 2.4)) * 0.8;
          rHipX = Math.max(0, -Math.sin(d * 2.4)) * 0.8;
          lKneeX = 0.65;
          rKneeX = 0.65;
        } else if (emoteId === 'hype') {
          const bounce = Math.abs(Math.sin(d * 2.2));
          targetBodyY = 0.78 + bounce * 0.24;
          lHipX = -0.45 * (1 - bounce);
          rHipX = -0.45 * (1 - bounce);
          lKneeX = 0.95 * (1 - bounce);
          rKneeX = 0.95 * (1 - bounce);
          lShX = -2.2 + bounce * 0.8;
          rShX = -2.2 + bounce * 0.8;
          lShZ = 0.65;
          rShZ = -0.65;
        } else if (emoteId === 'backflip') {
          const cycle = (d * 0.42) % (Math.PI * 2);
          if (cycle < 3.6) {
            const p = cycle / 3.6;
            targetAnimY = Math.sin(p * Math.PI) * 1.65;
            targetAnimTiltX = -p * Math.PI * 2;
            lHipX = -1.1;
            rHipX = -1.1;
            lKneeX = 1.6;
            rKneeX = 1.6;
            lShX = -1.5;
            rShX = -1.5;
          } else {
            targetBodyY = 0.84;
            lShZ = 1.25;
            rShZ = -1.25;
            lHipX = -0.35;
            lKneeX = 0.65;
          }
        } else if (emoteId === 'moonwalk') {
          const glide = Math.sin(d * 1.8);
          targetBodyYaw = 0.62;
          targetBodyTiltX = 0.14;
          targetBodyY = 0.93 + Math.abs(Math.cos(d * 1.8)) * 0.05;
          lHipX = glide * 0.55;
          rHipX = -glide * 0.55;
          lKneeX = glide > 0 ? 0.52 : 0.08;
          rKneeX = glide < 0 ? 0.52 : 0.08;
          rShX = -2.05 + Math.sin(d * 0.9) * 0.15;
          rElbX = -1.1;
          lShX = 0.25;
          lElbX = -0.9;
        } else if (emoteId === 'drums') {
          const beatL = Math.sin(d * 5.2);
          const beatR = Math.cos(d * 5.2);
          targetBodyY = 0.91 + Math.abs(beatL) * 0.06;
          targetBodyTiltX = 0.12;
          targetHeadTiltX = beatL * 0.16;
          lShX = -0.95 + beatL * 0.45;
          rShX = -0.95 + beatR * 0.45;
          lElbX = -0.75 + beatL * 0.5;
          rElbX = -0.75 + beatR * 0.5;
          lShZ = -0.15;
          rShZ = 0.15;
          lHipX = -0.22;
          rHipX = 0.22;
          lKneeX = 0.35;
          rKneeX = 0.35;
        } else if (emoteId === 'freeze') {
          const phase = (d * 0.5) % 4;
          if (phase < 2.2) {
            targetBodyY = 0.92 + Math.abs(Math.sin(d * 3.0)) * 0.12;
            lHipX = Math.max(0, Math.sin(d * 3.0)) * 0.65;
            rHipX = Math.max(0, -Math.sin(d * 3.0)) * 0.65;
            lKneeX = 0.6;
            rKneeX = 0.6;
            lShX = -1.1 + Math.sin(d * 3.0) * 0.5;
            rShX = -1.1 - Math.sin(d * 3.0) * 0.5;
          } else {
            targetBodyY = 0.72;
            targetBodyTiltZ = 0.52;
            targetBodyYaw = 0.35;
            rShX = -2.3;
            rShZ = -0.8;
            lShX = -0.5;
            lShZ = 1.25;
            lHipX = -0.95;
            lKneeX = 1.3;
            rHipX = 0.35;
            rKneeX = 0.2;
          }
        } else if (emoteId === 'dab') {
          const snap = Math.sin(d * 2.2);
          if (snap > 0) {
            targetBodyY = 0.86;
            targetBodyTiltX = 0.22;
            targetBodyYaw = 0.35;
            targetHeadTiltX = 0.42;
            lShX = -1.45;
            lShZ = -0.55;
            lElbX = -1.25;
            rShX = -1.75;
            rShZ = -1.25;
            rElbX = -0.1;
            lHipX = -0.25;
            lKneeX = 0.45;
          } else {
            targetBodyY = 0.96;
            lShX = -0.55;
            rShX = -0.55;
            lShZ = 0.45;
            rShZ = -0.45;
          }
        } else {
          const beat = Math.floor(d / 3.14) % 3;
          targetBodyY = 0.96 + Math.abs(Math.sin(d * 2.2)) * 0.14;
          if (beat === 0) {
            targetBodyYaw = Math.sin(d * 1.4) * 0.42;
            lShZ = 0.7 + Math.sin(d * 3) * 0.7;
            rShZ = -0.7 - Math.sin(d * 3) * 0.7;
            lShX = -1.35;
            rShX = -1.35;
            lHipX = Math.sin(d * 2) * 0.3;
            rHipX = -Math.sin(d * 2) * 0.3;
          } else if (beat === 1) {
            targetBodyYaw = d * 2.2;
            lShZ = 1.1 + Math.sin(d * 2.5) * 0.4;
            rShZ = -1.1 - Math.cos(d * 2.5) * 0.4;
            lShX = -0.4;
            rShX = -2.2;
            lKneeX = 0.35;
            rKneeX = 0.35;
          } else {
            targetBodyTiltZ = Math.sin(d * 2) * 0.18;
            lShX = -0.8 + Math.cos(d * 2) * 0.6;
            rShX = -0.8 - Math.cos(d * 2) * 0.6;
            lHipX = Math.max(0, Math.sin(d * 2)) * 0.55;
            rHipX = Math.max(0, -Math.sin(d * 2)) * 0.55;
            lKneeX = 0.45;
            rKneeX = 0.45;
          }
        }
      } else if (isGliding) {
        targetBodyTiltX = 0.36 + Math.sin(t * 1.6) * 0.07;
        targetBodyTiltZ = Math.sin(t * 1.3) * 0.14;
        targetHeadTiltX = -0.28;
        lShX = -2.65;
        rShX = -2.65;
        lShZ = 0.35;
        rShZ = -0.35;
        lElbX = -0.3;
        rElbX = -0.3;
        lHipX = -0.22 + Math.sin(t * 1.8) * 0.1;
        rHipX = 0.18 - Math.sin(t * 1.8) * 0.1;
        lKneeX = 0.52;
        rKneeX = 0.32;
        lAnkleX = 0.35;
        rAnkleX = 0.28;
      } else if (!onGround) {
        lHipX = -0.48;
        lKneeX = 0.92;
        lAnkleX = 0.35;
        rHipX = 0.24;
        rKneeX = 0.38;
        rAnkleX = -0.22;
        lShX = -0.82;
        lShY = isTwoHandGun ? 0.44 : 0;
        lElbX = -0.75;
        rShX = -0.74;
        rElbX = -0.8;
        lShZ = 0.22;
        rShZ = -0.14;
      } else if (speed > 0.5) {
        const sprinting = speed > 11.5;
        const gaitFreq = speed * (sprinting ? 1.04 : 0.98);
        const prevPhase = stepPhase;
        stepPhase += dt * gaitFreq;
        if (playFootsteps && onStep && Math.floor(prevPhase / Math.PI) !== Math.floor(stepPhase / Math.PI)) {
          onStep();
        }

        const amp = sprinting ? 0.92 : isCrouching ? 0.46 : 0.62;
        const s = Math.sin(stepPhase);
        const c = Math.cos(stepPhase);
        lHipX = s * amp;
        rHipX = -s * amp;
        lKneeX = Math.max(0, -c * (sprinting ? 1.05 : 0.85) + (isCrouching ? 0.82 : 0.18));
        rKneeX = Math.max(0, c * (sprinting ? 1.05 : 0.85) + (isCrouching ? 0.82 : 0.18));
        // Natural heel-strike / toe-off plantar articulation
        lAnkleX = Math.sin(stepPhase + 0.55) * (sprinting ? 0.48 : 0.3);
        rAnkleX = -Math.sin(stepPhase + 0.55) * (sprinting ? 0.48 : 0.3);

        // Physically accurate double-frequency vertical CoM stride arc
        const strideLift = (1 - Math.cos(stepPhase * 2)) * 0.5;
        targetBodyY += strideLift * (sprinting ? 0.115 : 0.065);
        targetBodyTiltX = sprinting ? 0.28 : isCrouching ? 0.28 : 0.1;
        targetBodyTiltZ = s * (sprinting ? 0.065 : 0.028);
        targetBodyYaw = s * (sprinting ? 0.12 : 0.075);
        targetHeadYaw = -targetBodyYaw * 0.72;

        if (isAiming && isTwoHandGun) {
          lShX = -0.96;
          lShY = 0.55;
          lShZ = -0.24;
          lElbX = -0.74;
          rShX = -0.86;
          rShY = -0.14;
          rElbX = -0.78;
          targetBodyYaw = -0.16;
          targetHeadYaw = 0.16;
          targetHeadTiltZ = -0.07;
          targetHeadTiltX -= 0.08;
        } else if (currentWeaponId === 'pickaxe') {
          lShX = -s * 0.72 - 0.16;
          lElbX = -0.58 + Math.max(0, s) * 0.2;
          rShX = s * 0.48 - 0.36;
          rElbX = -0.6;
        } else if (isTwoHandGun) {
          lShX = -0.84 - s * (sprinting ? 0.18 : 0.08);
          lShY = 0.52;
          lShZ = -0.2;
          lElbX = -0.74;
          rShX = -0.72 + s * (sprinting ? 0.2 : 0.1);
          rShY = -0.12;
          rElbX = -0.82 - c * 0.09;
          rShZ = -0.06;
          wpnRotZ = c * (sprinting ? 0.1 : 0.045);
        } else {
          lShX = -s * 0.5 - 0.15;
          rShX = -0.68;
          rElbX = -0.82;
        }
      } else {
        const breath = Math.sin(t * 0.9);
        targetBodyY += breath * 0.024;
        if (isCrouching) {
          lHipX = -0.68;
          rHipX = -0.68;
          lKneeX = 1.18;
          rKneeX = 1.18;
          lAnkleX = -0.35;
          rAnkleX = -0.35;
          targetBodyTiltX = 0.22;
        }
        if (isAiming && isTwoHandGun) {
          lShX = -0.96;
          lShY = 0.56;
          lShZ = -0.24;
          lElbX = -0.74;
          rShX = -0.86;
          rShY = -0.14;
          rElbX = -0.78;
          targetBodyYaw = -0.18;
          targetHeadYaw = 0.18;
          targetHeadTiltZ = -0.08;
          targetHeadTiltX -= 0.1;
        } else if (currentWeaponId === 'pickaxe') {
          lShX = -0.14 + breath * 0.045;
          rShX = -0.36 - breath * 0.04;
          rElbX = -0.58;
        } else if (isTwoHandGun) {
          lShX = -0.82 + breath * 0.032;
          lShY = 0.52;
          lShZ = -0.22;
          lElbX = -0.74;
          rShX = -0.68 + breath * 0.02;
          rShY = -0.12;
          rElbX = -0.82;
        } else {
          lShX = -0.25 + breath * 0.03;
          rShX = -0.65;
          rElbX = -0.82;
        }
      }

      // Springy landing knee cushion
      if (!isDead && !isSliding && landingDip > 0.01 && onGround && !isSwimming) {
        const dipCurve = Math.sin(landingDip * Math.PI);
        targetBodyY -= dipCurve * 0.18;
        targetBodyTiltX += dipCurve * 0.18;
        lHipX -= dipCurve * 0.42;
        rHipX -= dipCurve * 0.42;
        lKneeX += dipCurve * 0.85;
        rKneeX += dipCurve * 0.85;
        lAnkleX -= dipCurve * 0.35;
        rAnkleX -= dipCurve * 0.35;
      }

      // Diagonal Overhead Pickaxe Swing Animation (Windup -> Whip Strike -> Follow-through)
      if (!isDead && pickaxeSwing > 0 && currentWeaponId === 'pickaxe') {
        const swingCurve = Math.sin(pickaxeSwing * Math.PI);
        const windup = pickaxeSwing < 0.35 ? -pickaxeSwing * 2.5 : (pickaxeSwing - 0.35) * 3.2;
        rShX = -1.8 + windup * 1.5;
        rShZ = -0.45 + swingCurve * 0.9;
        rElbX = -0.42 - swingCurve * 0.6;
        lShX = -0.82;
        lElbX = -0.68;
        targetBodyYaw += (pickaxeSwing < 0.35 ? -0.4 : 0.62) * swingCurve;
        targetBodyTiltX += 0.24 * swingCurve;
        targetBodyY -= 0.08 * swingCurve;
      }

      if (!isDead && reloading > 0) {
        const prog = 1 - Math.min(1, reloading / Math.max(0.2, reloadTotal));
        const grabPhase = Math.sin(prog * Math.PI);
        const boltRack = prog > 0.7 ? Math.sin(((prog - 0.7) / 0.3) * Math.PI) : 0;
        rShX = -0.78 - boltRack * 0.18;
        rElbX = -0.92;
        lShX = -0.52 - grabPhase * 0.84 - boltRack * 0.32;
        lShY = 0.48;
        lElbX = -0.65 - grabPhase * 0.65;
        lShZ = -0.18;
        targetBodyTiltZ -= 0.11 * grabPhase;
        wpnRotZ -= grabPhase * 0.44;
        wpnPosZ -= boltRack * 0.06;
      }
      if (!isDead && healing > 0) {
        const gulp = Math.sin(performance.now() * 0.016);
        rShX = -1.32 + gulp * 0.2;
        rElbX = -1.18;
        lShX = -0.78;
        lElbX = -0.9;
        targetBodyTiltX -= 0.09 + gulp * 0.05;
      }
      if (!isDead && equipTimer > 0) {
        rShX += equipTimer * 1.85;
        rElbX -= equipTimer * 0.85;
        lShX += equipTimer * 0.8;
      }

      // Weapon Shooting Kick + Slide Recoil Animation
      if (!isDead && recoil > 0.01) {
        rShX -= recoil * 0.3;
        rElbX -= recoil * 0.18;
        lShX -= recoil * 0.15;
        wpnPosZ -= recoil * 0.055;
        targetBodyTiltX -= recoil * 0.13;
      }
      if (!isDead) {
        targetBodyTiltX -= hitFlinch * 0.36;
        targetBodyTiltZ += hitFlinch * 0.24;
      }

      // Exact Palm Counter-Rotation so weapon/pickaxe sits firmly in fist and points forward!
      const totalArmPitch = rShX + rElbX;
      if (currentWeaponId === 'pickaxe') {
        const swingTilt = pickaxeSwing > 0 ? (pickaxeSwing < 0.4 ? -0.45 : 1.05) : 0.48;
        wpnRotX = -totalArmPitch + swingTilt;
      } else if (isTwoHandGun) {
        const aimPitchOffset = THREE.MathUtils.clamp(pitch * 0.45, -0.35, 0.35);
        const walkCarryOffset = speed > 0.5 && !isAiming && !isSliding ? 0.08 : 0;
        wpnRotX = -totalArmPitch + aimPitchOffset + walkCarryOffset - recoil * 0.22 - equipTimer * 0.7;
        wpnRotY = -rShY + (isAiming ? 0.06 : 0.12);
      } else {
        wpnRotX = -totalArmPitch + 0.15;
      }

      animRoot.position.y = THREE.MathUtils.lerp(animRoot.position.y, targetAnimY, lerpF);
      animRoot.rotation.x = THREE.MathUtils.lerp(animRoot.rotation.x, targetAnimTiltX, lerpF);
      animRoot.rotation.z = THREE.MathUtils.lerp(animRoot.rotation.z, targetAnimTiltZ, lerpF);

      bodyPivot.position.y = THREE.MathUtils.lerp(bodyPivot.position.y, targetBodyY, lerpF);
      bodyPivot.rotation.x = THREE.MathUtils.lerp(bodyPivot.rotation.x, targetBodyTiltX, lerpF);
      bodyPivot.rotation.z = THREE.MathUtils.lerp(bodyPivot.rotation.z, targetBodyTiltZ, lerpF);
      bodyPivot.rotation.y = THREE.MathUtils.lerp(bodyPivot.rotation.y, targetBodyYaw, lerpF);

      leftLeg.hip.rotation.x = THREE.MathUtils.lerp(leftLeg.hip.rotation.x, lHipX, lerpF);
      rightLeg.hip.rotation.x = THREE.MathUtils.lerp(rightLeg.hip.rotation.x, rHipX, lerpF);
      leftLeg.knee.rotation.x = THREE.MathUtils.lerp(leftLeg.knee.rotation.x, lKneeX, lerpF);
      rightLeg.knee.rotation.x = THREE.MathUtils.lerp(rightLeg.knee.rotation.x, rKneeX, lerpF);
      leftLeg.ankle.rotation.x = THREE.MathUtils.lerp(leftLeg.ankle.rotation.x, lAnkleX, lerpF);
      rightLeg.ankle.rotation.x = THREE.MathUtils.lerp(rightLeg.ankle.rotation.x, rAnkleX, lerpF);

      leftArm.shoulder.rotation.x = THREE.MathUtils.lerp(leftArm.shoulder.rotation.x, lShX, lerpF);
      leftArm.shoulder.rotation.y = THREE.MathUtils.lerp(leftArm.shoulder.rotation.y, lShY, lerpF);
      leftArm.shoulder.rotation.z = THREE.MathUtils.lerp(leftArm.shoulder.rotation.z, lShZ, lerpF);
      leftArm.elbow.rotation.x = THREE.MathUtils.lerp(leftArm.elbow.rotation.x, lElbX, lerpF);

      rightArm.shoulder.rotation.x = THREE.MathUtils.lerp(rightArm.shoulder.rotation.x, rShX, lerpF);
      rightArm.shoulder.rotation.y = THREE.MathUtils.lerp(rightArm.shoulder.rotation.y, rShY, lerpF);
      rightArm.shoulder.rotation.z = THREE.MathUtils.lerp(rightArm.shoulder.rotation.z, rShZ, lerpF);
      rightArm.elbow.rotation.x = THREE.MathUtils.lerp(rightArm.elbow.rotation.x, rElbX, lerpF);

      weaponMount.rotation.x = THREE.MathUtils.lerp(weaponMount.rotation.x, wpnRotX, lerpF);
      weaponMount.rotation.y = THREE.MathUtils.lerp(weaponMount.rotation.y, wpnRotY, lerpF);
      weaponMount.rotation.z = THREE.MathUtils.lerp(weaponMount.rotation.z, wpnRotZ, lerpF);
      weaponMount.position.z = THREE.MathUtils.lerp(weaponMount.position.z, wpnPosZ, lerpF);

      headGroup.rotation.x = THREE.MathUtils.lerp(headGroup.rotation.x, targetHeadTiltX, lerpF);
      headGroup.rotation.y = THREE.MathUtils.lerp(headGroup.rotation.y, targetHeadYaw, lerpF);
      headGroup.rotation.z = THREE.MathUtils.lerp(headGroup.rotation.z, targetHeadTiltZ, lerpF);
    },
  };
}

// Upgraded Ornate Treasure Chest (beveled body, corner iron straps, glowing keyhole & internal crystal)
const chestPlinthGeo = createBeveledRectGeo(1.72, 0.14, 1.24, 0.08, 0.02);
const chestBaseGeo = createBeveledRectGeo(1.5, 0.78, 1.04, 0.08, 0.03);
const chestTrimGeo = new THREE.BoxGeometry(1.58, 0.16, 1.12);
const chestStrapGeo = new THREE.BoxGeometry(0.14, 0.84, 1.1);
const chestLidGeo = new THREE.BoxGeometry(1.56, 0.28, 1.1);
const chestDomeGeo = new THREE.CylinderGeometry(0.48, 0.48, 1.52, 16, 1, false, 0, Math.PI);
const chestLatchGeo = createBeveledRectGeo(0.28, 0.3, 0.14, 0.04, 0.015);
const chestCrystalGeo = new THREE.OctahedronGeometry(0.22, 0);
const chestHaloGeo = new THREE.CylinderGeometry(0.16, 0.28, 3.6, 10);
const chestHaloMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.36 });
const chestRingGeo = new THREE.TorusGeometry(0.95, 0.08, 8, 24);
const chestRingMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.85 });

export function createChestGroup(textures?: ProceduralTextures): {
  group: THREE.Group;
  lidPivot: THREE.Group;
  halo: THREE.Mesh;
  shockRing: THREE.Mesh;
} {
  const pm = getSharedPropMats(textures);
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(chestPlinthGeo, pm.darkMetal);
  plinth.position.y = 0.07;
  const base = new THREE.Mesh(chestBaseGeo, pm.chestGold);
  base.position.y = 0.48;
  base.castShadow = true;
  const trim = new THREE.Mesh(chestTrimGeo, pm.chestTrim);
  trim.position.y = 0.84;

  for (const sx of [-0.54, 0.54]) {
    const strap = new THREE.Mesh(chestStrapGeo, pm.chestTrim);
    strap.position.set(sx, 0.5, 0);
    group.add(strap);
  }

  const crystal = new THREE.Mesh(chestCrystalGeo, pm.chestCrystal);
  crystal.position.set(0, 0.86, 0);

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.88, -0.52);

  const lid = new THREE.Mesh(chestLidGeo, pm.chestTrim);
  lid.position.set(0, 0.12, 0.52);
  const dome = new THREE.Mesh(chestDomeGeo, pm.chestGold);
  dome.rotation.z = Math.PI / 2;
  dome.rotation.y = Math.PI / 2;
  dome.position.set(0, 0.24, 0.52);
  const latch = new THREE.Mesh(chestLatchGeo, pm.silverMetal);
  latch.position.set(0, 0.02, 1.07);
  lidPivot.add(lid, dome, latch);

  const halo = new THREE.Mesh(chestHaloGeo, chestHaloMat);
  halo.position.y = 2.05;

  const shockRing = new THREE.Mesh(chestRingGeo, chestRingMat.clone());
  shockRing.rotation.x = Math.PI / 2;
  shockRing.position.y = 0.72;
  shockRing.visible = false;

  group.add(plinth, base, trim, crystal, lidPivot, halo, shockRing);
  return { group, lidPivot, halo, shockRing };
}

// Detailed 3D Armored Battle Bus + Hot Air Balloon & Jet Turbines
export function createBattleBusGroup(textures?: ProceduralTextures): {
  group: THREE.Group;
  animate: (dt: number) => void;
} {
  const pm = getSharedPropMats(textures);
  const group = new THREE.Group();

  const hull = new THREE.Mesh(createBeveledRectGeo(3.6, 2.9, 10.6, 0.35, 0.12), pm.busBlue);
  hull.position.set(0, 1.9, 0);
  hull.castShadow = true;
  group.add(hull);

  // Yellow racing stripe + upper cabin crown + roof luggage rails & amber beacon
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.74, 0.42, 10.4), pm.busYellow);
  stripe.position.set(0, 1.55, 0);
  const roof = new THREE.Mesh(createBeveledRectGeo(3.2, 0.45, 9.6, 0.25, 0.08), pm.silverMetal);
  roof.position.set(0, 3.45, -0.2);
  group.add(stripe, roof);

  for (const sx of [-1.2, 1.2]) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 6.2), pm.darkMetal);
    rack.position.set(sx, 3.74, -0.6);
    group.add(rack);
  }
  const roofBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), pm.chestCrystal);
  roofBeacon.position.set(0, 3.82, 3.2);
  group.add(roofBeacon);

  // Cabin Windshield + Pillars & Side Windows + Side Mirrors
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(3.15, 1.25, 0.25), pm.scopeGlass);
  windshield.position.set(0, 2.45, 5.25);
  windshield.rotation.x = -0.15;
  const centerPillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.26, 0.28), pm.darkMetal);
  centerPillar.position.set(0, 2.45, 5.25);
  centerPillar.rotation.x = -0.15;
  const sideWin = new THREE.Mesh(new THREE.BoxGeometry(3.72, 0.95, 7.6), pm.scopeGlass);
  sideWin.position.set(0, 2.52, -0.35);
  group.add(windshield, centerPillar, sideWin);

  for (const wz of [-2.8, -0.9, 1.0, 2.8]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(3.78, 1.0, 0.16), pm.darkMetal);
    mullion.position.set(0, 2.52, wz);
    group.add(mullion);
  }
  for (const sx of [-2.05, 2.05]) {
    const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), pm.darkMetal);
    mirrorArm.position.set(sx, 2.35, 4.6);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.14), pm.silverMetal);
    mirror.position.set(sx + (sx > 0 ? 0.2 : -0.2), 2.35, 4.55);
    group.add(mirrorArm, mirror);
  }

  // Front Radiator Grille + Armored Bumper + Tow Hooks + Glowing Headlights
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(3.85, 0.58, 0.72), pm.darkMetal);
  bumper.position.set(0, 0.85, 5.45);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.78, 0.24), pm.silverMetal);
  grille.position.set(0, 1.48, 5.32);
  group.add(bumper, grille);
  for (const sx of [-1.25, 1.25]) {
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), pm.chestCrystal);
    hl.rotation.x = Math.PI / 2;
    hl.position.set(sx, 1.38, 5.38);
    group.add(hl);
  }

  // Wheels + Rims
  const wheelGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.55, 14);
  const rimGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.58, 10);
  for (const sx of [-1.85, 1.85]) {
    for (const sz of [-3.3, 3.3]) {
      const w = new THREE.Mesh(wheelGeo, pm.darkMetal);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, 0.72, sz);
      const rim = new THREE.Mesh(rimGeo, pm.silverMetal);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(sx, 0.72, sz);
      group.add(w, rim);
    }
  }

  // Side Thruster Nacelles & Spinning Turbines
  const turbines: THREE.Group[] = [];
  for (const sx of [-2.55, 2.55]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.78, 2.6, 14), pm.gunmetal);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(sx, 2.1, -0.8);
    const intakeRing = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.09, 8, 16), pm.silverMetal);
    intakeRing.position.set(sx, 2.1, 0.5);
    group.add(pod, intakeRing);

    const bladeGroup = new THREE.Group();
    bladeGroup.position.set(sx, 2.1, 0.52);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.08), pm.silverMetal);
      blade.rotation.z = (b * Math.PI) / 4;
      bladeGroup.add(blade);
    }
    group.add(bladeGroup);
    turbines.push(bladeGroup);
  }

  // Rear Exhaust Flame Cones
  const flames: THREE.Mesh[] = [];
  for (const sx of [-0.95, 0.95]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 0.9, 12), pm.darkMetal);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(sx, 1.35, -5.55);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.2, 10), pm.busFlame);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(sx, 1.35, -7.0);
    group.add(nozzle, flame);
    flames.push(flame);
  }

  // Overhead Suspension Struts + Burner + Giant Multi-Gore Hot-Air Balloon
  for (const sx of [-1.25, 1.25]) {
    for (const sz of [-2.4, 2.4]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.6, 8), pm.silverMetal);
      strut.position.set(sx, 5.7, sz);
      strut.rotation.z = sx > 0 ? -0.18 : 0.18;
      group.add(strut);
    }
  }
  const burner = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), pm.busFlame);
  burner.position.set(0, 6.9, 0);
  group.add(burner);

  const balloon = new THREE.Mesh(new THREE.SphereGeometry(5.6, 24, 18), pm.busBlue);
  balloon.scale.set(1.0, 1.18, 1.45);
  balloon.position.set(0, 12.6, 0);
  balloon.castShadow = true;
  const balloonBand = new THREE.Mesh(new THREE.TorusGeometry(5.55, 0.45, 10, 24), pm.busYellow);
  balloonBand.rotation.x = Math.PI / 2;
  balloonBand.scale.set(1.0, 1.45, 1.0);
  balloonBand.position.set(0, 12.6, 0);
  const balloonCap = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 0.7, 16), pm.busYellow);
  balloonCap.position.set(0, 19.0, 0);
  group.add(balloon, balloonBand, balloonCap);

  let animTime = 0;
  return {
    group,
    animate(dt: number) {
      animTime += dt;
      for (const tb of turbines) tb.rotation.z += dt * 16;
      const flicker = 0.85 + Math.sin(animTime * 28) * 0.18;
      for (const fl of flames) fl.scale.set(1, flicker, 1);
      burner.scale.setScalar(0.9 + Math.cos(animTime * 22) * 0.12);
      roofBeacon.scale.setScalar(0.85 + Math.abs(Math.sin(animTime * 8)) * 0.35);
    },
  };
}

const lootPadGeo = new THREE.CylinderGeometry(0.46, 0.55, 0.08, 16);
const lootBeamGeo = new THREE.CylinderGeometry(0.06, 0.24, 2.3, 10);
const lootPadMatCache = new Map<number, THREE.MeshStandardMaterial>();
const lootBeamMatCache = new Map<number, THREE.MeshBasicMaterial>();

export function createGroundLootGroup(
  item: InventoryItem,
  getLootLabelTexture: (name: string, rarityLabel: string, colorCss: string) => THREE.CanvasTexture,
  textures?: ProceduralTextures,
): THREE.Group {
  const colHex = item.def.type === 'heal' ? 0x38bdf8 : item.rarity.hex;
  const colorCss = item.def.type === 'heal' ? '#38bdf8' : item.rarity.color;
  const rarityLabel = item.def.type === 'heal' ? 'CONSUMABLE' : item.rarity.name;

  const g = new THREE.Group();
  const spinGroup = new THREE.Group();
  spinGroup.name = 'lootSpinner';

  const model = createWeaponModel(item.def.id, colHex, textures);
  model.position.y = 0.65;
  model.scale.setScalar(1.35);

  let padMat = lootPadMatCache.get(colHex);
  if (!padMat) {
    padMat = new THREE.MeshStandardMaterial({
      color: colHex,
      emissive: colHex,
      emissiveIntensity: 0.22,
      roughness: 0.42,
    });
    lootPadMatCache.set(colHex, padMat);
  }
  const pad = new THREE.Mesh(lootPadGeo, padMat);
  pad.position.y = 0.04;

  let beamMat = lootBeamMatCache.get(colHex);
  if (!beamMat) {
    beamMat = new THREE.MeshBasicMaterial({ color: colHex, transparent: true, opacity: 0.2 });
    lootBeamMatCache.set(colHex, beamMat);
  }
  const beam = new THREE.Mesh(lootBeamGeo, beamMat);
  beam.position.y = 1.25;

  spinGroup.add(model);
  g.add(pad, beam, spinGroup);

  const labelTex = getLootLabelTexture(item.def.name, rarityLabel, colorCss);
  const spriteMat = new THREE.SpriteMaterial({
    map: labelTex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.name = 'lootLabel';
  sprite.position.set(0, 1.78, 0);
  sprite.scale.set(2.35, 0.66, 1);
  g.add(sprite);

  return g;
}

const ammoBoxGeo = new THREE.BoxGeometry(0.66, 0.42, 0.44);
const ammoLidGeo = new THREE.BoxGeometry(0.70, 0.10, 0.48);
const ammoStrapGeo = new THREE.BoxGeometry(0.14, 0.46, 0.49);
const ammoShellGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.22, 8);
const ammoBrassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.48, roughness: 0.38 });
const ammoCrateOliveMat = new THREE.MeshStandardMaterial({ color: 0x3f4d36, metalness: 0.14, roughness: 0.72 });

export function createAmmoPackGroup(
  ammoType: AmmoType,
  amount: number,
  getLootLabelTexture: (name: string, rarityLabel: string, colorCss: string) => THREE.CanvasTexture,
): THREE.Group {
  const def = AMMO_DEFS[ammoType];
  const colHex = def.hex;

  const g = new THREE.Group();
  const spinGroup = new THREE.Group();
  spinGroup.name = 'lootSpinner';

  let accentMat = lootPadMatCache.get(colHex);
  if (!accentMat) {
    accentMat = new THREE.MeshStandardMaterial({
      color: colHex,
      emissive: colHex,
      emissiveIntensity: 0.22,
      roughness: 0.42,
    });
    lootPadMatCache.set(colHex, accentMat);
  }

  const crate = new THREE.Mesh(ammoBoxGeo, ammoCrateOliveMat);
  crate.position.y = 0.58;
  crate.castShadow = true;

  const lid = new THREE.Mesh(ammoLidGeo, ammoCrateOliveMat);
  lid.position.y = 0.80;

  const strap = new THREE.Mesh(ammoStrapGeo, accentMat);
  strap.position.y = 0.60;

  spinGroup.add(crate, lid, strap);
  for (let i = -1; i <= 1; i++) {
    const round = new THREE.Mesh(ammoShellGeo, ammoBrassMat);
    round.position.set(i * 0.14, 0.88, 0);
    spinGroup.add(round);
  }

  const pad = new THREE.Mesh(lootPadGeo, accentMat);
  pad.scale.set(0.82, 1, 0.82);
  pad.position.y = 0.04;

  let beamMat = lootBeamMatCache.get(colHex);
  if (!beamMat) {
    beamMat = new THREE.MeshBasicMaterial({ color: colHex, transparent: true, opacity: 0.16 });
    lootBeamMatCache.set(colHex, beamMat);
  }
  const beam = new THREE.Mesh(lootBeamGeo, beamMat);
  beam.scale.set(0.68, 0.72, 0.68);
  beam.position.y = 0.92;

  g.add(pad, beam, spinGroup);

  const labelTex = getLootLabelTexture(`+${amount} ${def.name}`, 'AMMO', def.color);
  const spriteMat = new THREE.SpriteMaterial({
    map: labelTex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.name = 'lootLabel';
  sprite.position.set(0, 1.56, 0);
  sprite.scale.set(2.15, 0.60, 1);
  g.add(sprite);

  return g;
}

const pingDiamondGeo = new THREE.OctahedronGeometry(0.46, 0);
const pingRingGeo = new THREE.RingGeometry(0.55, 0.78, 24);
const pingDiamondMat = new THREE.MeshBasicMaterial({
  color: 0xef4444,
  transparent: true,
  opacity: 0.92,
});
const pingRingMat = new THREE.MeshBasicMaterial({
  color: 0xfacc15,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
});

export function createTacticalPingMarker(): THREE.Group {
  const g = new THREE.Group();
  const diamond = new THREE.Mesh(pingDiamondGeo, pingDiamondMat);
  diamond.name = 'pingDiamond';
  diamond.position.y = 2.65;
  diamond.scale.set(0.95, 1.45, 0.95);

  const ring = new THREE.Mesh(pingRingGeo, pingRingMat);
  ring.name = 'pingRing';
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.16;

  g.add(diamond, ring);
  return g;
}

export function createPlayerNameplate(name: string, badgeLabel = 'ALLY', accentCss = '#38bdf8'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 112;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);

  ctx.fillStyle = 'rgba(7, 13, 30, 0.88)';
  ctx.beginPath();
  ctx.roundRect(14, 14, c.width - 28, c.height - 28, 18);
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = accentCss;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 22px "Chakra Petch", "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = accentCss;
  ctx.fillText(badgeLabel, c.width / 2, 36);

  ctx.font = '900 36px "Chakra Petch", "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, c.width / 2, 74, c.width - 64);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.82, 0.42, 1);
  return sprite;
}

export function createRebootVanGroup(textures?: ProceduralTextures): {
  group: THREE.Group;
  beacon: THREE.Mesh;
  ring: THREE.Mesh;
  padGlow: THREE.Mesh;
} {
  const pm = getSharedPropMats(textures);
  const group = new THREE.Group();

  const cyanTrimMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.38,
    roughness: 0.3,
    metalness: 0.25,
  });
  const bodyBlueMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a,
    roughness: 0.48,
    metalness: 0.28,
  });
  const tireMat = pm.bootSole;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.35, 4.9), bodyBlueMat);
  chassis.position.set(0, 1.05, 0);
  chassis.castShadow = true;
  chassis.receiveShadow = true;

  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.92, 1.55), bodyBlueMat);
  cab.position.set(0, 1.85, 1.25);
  cab.castShadow = true;

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.62, 0.14), pm.scopeGlass);
  windshield.position.set(0, 1.85, 2.02);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.36, 0.4), pm.darkMetal);
  bumper.position.set(0, 0.55, 2.5);

  const backStripe = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.24, 5.0), cyanTrimMat);
  backStripe.position.set(0, 1.28, 0);

  const terminal = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.25, 0.45), pm.darkMetal);
  terminal.position.set(0, 1.05, -2.55);

  const padGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.14, 20), cyanTrimMat);
  padGlow.position.set(0, 1.78, -0.8);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.2, 10), pm.silverMetal);
  mast.position.set(0, 2.8, -0.8);

  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), cyanTrimMat);
  beacon.position.set(0, 4.15, -0.8);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 2.75, 32),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.08, 0);

  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.38, 14);
  for (const wx of [-1.28, 1.28]) {
    for (const wz of [-1.55, 1.55]) {
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.48, wz);
      group.add(wheel);
    }
  }

  group.add(chassis, cab, windshield, bumper, backStripe, terminal, padGlow, mast, beacon, ring);
  return { group, beacon, ring, padGlow };
}

const cardMat = new THREE.MeshStandardMaterial({
  color: 0x38bdf8,
  emissive: 0x0ea5e9,
  emissiveIntensity: 0.55,
  roughness: 0.25,
  metalness: 0.3,
});
const cardRimMat = new THREE.MeshStandardMaterial({
  color: 0xf8fafc,
  emissive: 0xbae6fd,
  emissiveIntensity: 0.28,
  roughness: 0.35,
});

export function createRebootCardGroup(): THREE.Group {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.name = 'cardSpinner';

  const cardBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.68, 0.08), cardMat);
  cardBody.position.y = 0.85;
  const cardStripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.11), cardRimMat);
  cardStripe.position.y = 0.96;
  const cardIcon = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), cardRimMat);
  cardIcon.position.y = 0.72;

  spin.add(cardBody, cardStripe, cardIcon);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.22, 3.2, 10),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.26 }),
  );
  beam.position.y = 1.6;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.74, 24),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;

  g.add(spin, beam, ring);
  return g;
}



