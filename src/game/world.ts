import * as THREE from 'three';
import { MAP_SIZE, POIS } from './constants';
import { createRebootVanGroup } from './models';
import { getRiverCenterX, getTerrainHeight } from './rules';
import type { ProceduralTextures } from './textures';
import type { BuildingNavVolume, ChestSlot, ObstacleBox } from './types';

export interface LaunchPadDef {
  x: number;
  y: number;
  z: number;
  ringMesh: THREE.Mesh;
}

export interface RebootVanDef {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  beacon: THREE.Mesh;
  ring: THREE.Mesh;
  padGlow: THREE.Mesh;
}

export interface DestructibleCrateDef {
  id: number;
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  hp: number;
  broken: boolean;
}

export interface DestructibleStructureDef {
  id: number;
  meshes: THREE.Mesh[];
  obstacleIndices: number[];
  materialKind: 'wood' | 'brick' | 'metal' | 'glass' | 'prop';
  hp: number;
  maxHp: number;
  broken: boolean;
  center: { x: number; y: number; z: number };
  dropAmmoOnBreak?: boolean;
}

export interface WorldBuildResult {
  worldGroup: THREE.Group;
  obstacles: ObstacleBox[];
  buildings: BuildingNavVolume[];
  buildingSlots: ChestSlot[];
  floorLootSlots: ChestSlot[];
  colliderMeshes: THREE.Object3D[];
  oceanMesh: THREE.Mesh;
  clouds: THREE.Group[];
  launchPads: LaunchPadDef[];
  rebootVans: RebootVanDef[];
  foliageMeshes: THREE.Object3D[];
  ultraProps: THREE.Object3D[];
  destructibleCrates: DestructibleCrateDef[];
  destructibles: DestructibleStructureDef[];
  pbrNormalMaterials: THREE.MeshStandardMaterial[];
}

export function buildWorld(textures: ProceduralTextures): WorldBuildResult {
  const worldGroup = new THREE.Group();
  const obstacles: ObstacleBox[] = [];
  const buildings: BuildingNavVolume[] = [];
  const buildingSlots: ChestSlot[] = [];
  const floorLootSlots: ChestSlot[] = [];
  const colliderMeshes: THREE.Object3D[] = [];
  const clouds: THREE.Group[] = [];
  const launchPads: LaunchPadDef[] = [];
  const rebootVans: RebootVanDef[] = [];
  const foliageMeshes: THREE.Object3D[] = [];
  const ultraProps: THREE.Object3D[] = [];
  const destructibleCrates: DestructibleCrateDef[] = [];
  const destructibles: DestructibleStructureDef[] = [];
  const pbrNormalMaterials: THREE.MeshStandardMaterial[] = [];

  const trackPbr = (m: THREE.MeshStandardMaterial) => {
    textures.registerTierMaterial(m);
    pbrNormalMaterials.push(m);
    return m;
  };

  function addWallObstacle(
    x: number,
    z: number,
    w: number,
    d: number,
    minY: number,
    maxY: number,
    walkable = false,
    slope?: ObstacleBox['slope'],
  ): number {
    obstacles.push({ x, z, hw: w / 2 + 0.35, hd: d / 2 + 0.35, minY, maxY, walkable, slope });
    return obstacles.length - 1;
  }

  function registerDestructible(
    meshes: THREE.Mesh[],
    obstacleIndices: number[],
    materialKind: DestructibleStructureDef['materialKind'],
    maxHp: number,
    center: { x: number; y: number; z: number },
    dropAmmoOnBreak = false,
  ): DestructibleStructureDef {
    for (const m of meshes) {
      if (!colliderMeshes.includes(m)) colliderMeshes.push(m);
    }
    const def: DestructibleStructureDef = {
      id: destructibles.length,
      meshes,
      obstacleIndices,
      materialKind,
      hp: maxHp,
      maxHp,
      broken: false,
      center,
      dropAmmoOnBreak,
    };
    destructibles.push(def);
    return def;
  }

  // Vertex-colored Sky Dome + Sun (radius 1320 supports Ultra render distance cleanly)
  const skyGeo = new THREE.SphereGeometry(1320, 28, 18);
  const skyPos = skyGeo.attributes.position;
  const skyColors = new Float32Array(skyPos.count * 3);
  const zenithCol = new THREE.Color(0x1d4ed8);
  const midSkyCol = new THREE.Color(0x38bdf8);
  const horizonCol = new THREE.Color(0xdbeafe);
  const tmpCol = new THREE.Color();

  for (let i = 0; i < skyPos.count; i++) {
    const sy = skyPos.getY(i) / 1320;
    const hNorm = THREE.MathUtils.clamp((sy + 0.05) / 0.85, 0, 1);
    if (hNorm < 0.36) {
      tmpCol.copy(horizonCol).lerp(midSkyCol, hNorm / 0.36);
    } else {
      tmpCol.copy(midSkyCol).lerp(zenithCol, (hNorm - 0.36) / 0.64);
    }
    skyColors[i * 3] = tmpCol.r;
    skyColors[i * 3 + 1] = tmpCol.g;
    skyColors[i * 3 + 2] = tmpCol.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const skyDome = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  worldGroup.add(skyDome);

  // Sun disc + layered atmospheric corona
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(46, 24),
    new THREE.MeshBasicMaterial({ color: 0xfefce8, fog: false }),
  );
  sunDisc.position.set(420, 620, 340);
  sunDisc.lookAt(0, 0, 0);
  const sunHalo = new THREE.Mesh(
    new THREE.CircleGeometry(98, 24),
    new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.24, fog: false, depthWrite: false }),
  );
  sunHalo.position.copy(sunDisc.position).multiplyScalar(0.995);
  sunHalo.lookAt(0, 0, 0);
  worldGroup.add(sunDisc, sunHalo);

  // Drifting stylized cloud clusters
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.0,
    emissive: 0xe0f2fe,
    emissiveIntensity: 0.16,
  });
  const puffGeo = new THREE.DodecahedronGeometry(1, 1);
  for (let i = 0; i < 22; i++) {
    const cg = new THREE.Group();
    const ang = (i / 22) * Math.PI * 2;
    const rad = 140 + (i % 4) * 105;
    cg.position.set(Math.cos(ang) * rad, 118 + (i % 5) * 15, Math.sin(ang) * rad);
    const puffCount = 3 + (i % 3);
    for (let p = 0; p < puffCount; p++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      const sx = 14 + ((i + p) % 3) * 6;
      const sy = 6 + (p % 2) * 3;
      const sz = 11 + ((i * 2 + p) % 3) * 5;
      puff.scale.set(sx, sy, sz);
      puff.position.set((p - 1) * 11, (p % 2) * 2.5, ((p * 7) % 5) - 2);
      cg.add(puff);
    }
    worldGroup.add(cg);
    clouds.push(cg);
  }

  // Ocean plane extended to horizon with animated water texture + normal map
  const oceanGeo = new THREE.PlaneGeometry(4400, 4400);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.water,
      normalMap: textures.waterNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      color: 0x7dd3fc,
      roughness: 0.34,
      metalness: 0.16,
      transparent: true,
      opacity: 0.94,
    }),
  );
  oceanMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vOceanWorldPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vOceanWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vOceanWorldPos;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float distC = length(vOceanWorldPos.xz);
        float shoreBand = 1.0 - smoothstep(260.0, 345.0, distC);
        float ripple = sin(vOceanWorldPos.x * 0.14 + vOceanWorldPos.z * 0.11) * cos(vOceanWorldPos.z * 0.16);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.72, 0.92), shoreBand * 0.45);
        diffuseColor.rgb += vec3(0.08, 0.12, 0.14) * max(0.0, ripple);`,
      );
  };
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = -0.5;
  worldGroup.add(oceanMesh);

  // High-resolution PBR vertex-tinted island terrain with grass albedo, normal map, and roughness map
  const segs = 144;
  const terrainGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const vy = getTerrainHeight(vx, vz);
    pos.setY(i, vy);

    // Rich realistic multi-biome terrain shading (deep sandbar, warm beach, natural emerald meadow, alpine stone ridge, paved town plazas)
    const nNoise = Math.sin(vx * 0.045) * Math.cos(vz * 0.045) * 0.09 + Math.sin(vx * 0.11 + vz * 0.09) * 0.04;
    let r = 0.54 + nNoise;
    let g = 0.8 + nNoise;
    let b = 0.46 + nNoise * 0.5;
    if (vy < -0.1) {
      r = 0.96;
      g = 0.76;
      b = 0.5;
    } else if (vy < 0.85) {
      r = 1.12;
      g = 0.92;
      b = 0.62;
    } else if (vy > 7.8) {
      r = 0.66;
      g = 0.68;
      b = 0.67;
    } else if (vy > 5.8) {
      r = 0.5;
      g = 0.68;
      b = 0.44;
    } else if (vx > 68 && vy > 1.2) {
      // Autumn highlands golden-moss warmth
      r = 0.78 + nNoise;
      g = 0.74 + nNoise * 0.6;
      b = 0.4;
    }
    for (const poi of POIS) {
      const pd = Math.hypot(vx - poi.x, vz - poi.z);
      if (poi.type !== 'lake' && pd < poi.r * 0.62) {
        const blend = Math.min(1, (poi.r * 0.62 - pd) / (poi.r * 0.22));
        r = r * (1 - blend) + 0.52 * blend;
        g = g * (1 - blend) + 0.55 * blend;
        b = b * (1 - blend) + 0.62 * blend;
      }
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = trackPbr(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: textures.terrainGrass.map,
      normalMap: textures.terrainGrass.normalMap,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughnessMap: textures.terrainGrass.roughnessMap,
      metalnessMap: textures.terrainGrass.specularMap,
      roughness: 0.88,
      metalness: 0.06,
    }),
  );
  // World-space multi-scale detail + steep-slope cliff strata + beach transition shader
  terrainMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
        float terrainHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float terrainNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), u.x),
            mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef USE_MAP
          float macroN = terrainNoise(vTerrainWorldPos.xz * 0.032);
          float microN = terrainNoise(vTerrainWorldPos.xz * 0.19);
          float slopeRock = 1.0 - smoothstep(0.68, 0.88, abs(vTerrainWorldNormal.y));
          float strata = sin(vTerrainWorldPos.y * 3.8 + macroN * 4.0) * 0.06;
          vec3 cliffCol = vec3(0.42, 0.45, 0.50) + strata;
          vec3 lushShift = mix(vec3(0.86, 0.96, 0.84), vec3(1.12, 1.08, 0.88), macroN * 0.7 + microN * 0.3);
          diffuseColor.rgb *= lushShift;
          diffuseColor.rgb = mix(diffuseColor.rgb, cliffCol, slopeRock * 0.78);
        #endif`,
      );
  };
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);

  // Shared PBR props & architectural trim materials (Albedo + Normal + Roughness + Specular!)
  const crateMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.wood.map,
      normalMap: textures.wood.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: textures.wood.roughnessMap,
      metalnessMap: textures.wood.specularMap,
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.14,
    }),
  );
  const barrelMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.metal.map,
      normalMap: textures.metal.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: textures.metal.roughnessMap,
      metalnessMap: textures.metal.specularMap,
      color: 0x2563eb,
      roughness: 0.48,
      metalness: 0.28,
    }),
  );
  const trimMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.gunmetal.map,
      normalMap: textures.gunmetal.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: textures.gunmetal.roughnessMap,
      metalnessMap: textures.gunmetal.specularMap,
      color: 0x1e293b,
      roughness: 0.56,
      metalness: 0.24,
    }),
  );
  const stoneTrimMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.concrete.map,
      normalMap: textures.concrete.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: textures.concrete.roughnessMap,
      metalnessMap: textures.concrete.specularMap,
      color: 0xcbd5e1,
      roughness: 0.82,
      metalness: 0.08,
    }),
  );
  const awningPalette = [0xf59e0b, 0x0284c7, 0xdc2626, 0x059669].map((col) =>
    trackPbr(
      new THREE.MeshStandardMaterial({
        map: textures.fabric.map,
        normalMap: textures.fabric.normalMap,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughnessMap: textures.fabric.roughnessMap,
        metalnessMap: textures.fabric.specularMap,
        color: col,
        roughness: 0.74,
        metalness: 0.08,
      }),
    ),
  );
  const ventMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.metal.map,
      normalMap: textures.metal.normalMap,
      roughnessMap: textures.metal.roughnessMap,
      metalnessMap: textures.metal.specularMap,
      color: 0x94a3b8,
      roughness: 0.48,
      metalness: 0.36,
    }),
  );
  const windowMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.windowGlass,
      normalMap: textures.windowNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      emissive: 0x7dd3fc,
      emissiveIntensity: 0.1,
      roughness: 0.34,
      metalness: 0.22,
    }),
  );
  const foundationMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.rock.map,
      normalMap: textures.rock.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: textures.rock.roughnessMap,
      metalnessMap: textures.rock.specularMap,
      color: 0x64748b,
      roughness: 0.88,
      metalness: 0.08,
    }),
  );
  const lampBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfacc15,
    emissiveIntensity: 0.32,
    roughness: 0.32,
  });

  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.15, 14);
  const windowGlassGeo = new THREE.BoxGeometry(2.0, 1.85, 0.14);
  const windowFrameGeo = new THREE.BoxGeometry(2.38, 2.2, 0.18);
  const windowSillGeo = new THREE.BoxGeometry(2.55, 0.22, 0.46);
  const windowGlassSideGeo = new THREE.BoxGeometry(0.14, 1.85, 2.0);
  const windowFrameSideGeo = new THREE.BoxGeometry(0.18, 2.2, 2.38);
  const windowSillSideGeo = new THREE.BoxGeometry(0.46, 0.22, 2.55);

  type BuildingStyle = 'brick' | 'hangar' | 'hangarBlue' | 'wood' | 'house';

  const styleMaterials: Record<
    BuildingStyle,
    { wall: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial; floor: THREE.MeshStandardMaterial; pilaster: THREE.MeshStandardMaterial }
  > = {
    brick: {
      wall: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.brick.map,
          normalMap: textures.brick.normalMap,
          normalScale: new THREE.Vector2(1.3, 1.3),
          roughnessMap: textures.brick.roughnessMap,
          metalnessMap: textures.brick.specularMap,
          color: 0xffffff,
          roughness: 0.82,
          metalness: 0.12,
        }),
      ),
      roof: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.roofShingle.map,
          normalMap: textures.roofShingle.normalMap,
          normalScale: new THREE.Vector2(1.15, 1.15),
          roughnessMap: textures.roofShingle.roughnessMap,
          metalnessMap: textures.roofShingle.specularMap,
          color: 0x475569,
          roughness: 0.7,
          metalness: 0.26,
        }),
      ),
      floor: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.concrete.map,
          normalMap: textures.concrete.normalMap,
          roughnessMap: textures.concrete.roughnessMap,
          metalnessMap: textures.concrete.specularMap,
          color: 0x94a3b8,
          roughness: 0.86,
          metalness: 0.14,
        }),
      ),
      pilaster: stoneTrimMat,
    },
    hangar: {
      wall: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.metal.map,
          normalMap: textures.metal.normalMap,
          normalScale: new THREE.Vector2(1.05, 1.05),
          roughnessMap: textures.metal.roughnessMap,
          metalnessMap: textures.metal.specularMap,
          color: 0xef4444,
          roughness: 0.56,
          metalness: 0.3,
        }),
      ),
      roof: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.metal.map,
          normalMap: textures.metal.normalMap,
          normalScale: new THREE.Vector2(0.95, 0.95),
          roughnessMap: textures.metal.roughnessMap,
          metalnessMap: textures.metal.specularMap,
          color: 0x334155,
          roughness: 0.5,
          metalness: 0.36,
        }),
      ),
      floor: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.concrete.map,
          normalMap: textures.concrete.normalMap,
          roughnessMap: textures.concrete.roughnessMap,
          metalnessMap: textures.concrete.specularMap,
          color: 0x64748b,
          roughness: 0.86,
          metalness: 0.1,
        }),
      ),
      pilaster: trimMat,
    },
    hangarBlue: {
      wall: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.metal.map,
          normalMap: textures.metal.normalMap,
          normalScale: new THREE.Vector2(1.05, 1.05),
          roughnessMap: textures.metal.roughnessMap,
          metalnessMap: textures.metal.specularMap,
          color: 0x3b82f6,
          roughness: 0.56,
          metalness: 0.3,
        }),
      ),
      roof: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.metal.map,
          normalMap: textures.metal.normalMap,
          normalScale: new THREE.Vector2(0.95, 0.95),
          roughnessMap: textures.metal.roughnessMap,
          metalnessMap: textures.metal.specularMap,
          color: 0x334155,
          roughness: 0.5,
          metalness: 0.36,
        }),
      ),
      floor: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.concrete.map,
          normalMap: textures.concrete.normalMap,
          roughnessMap: textures.concrete.roughnessMap,
          metalnessMap: textures.concrete.specularMap,
          color: 0x64748b,
          roughness: 0.86,
          metalness: 0.1,
        }),
      ),
      pilaster: trimMat,
    },
    wood: {
      wall: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.wood.map,
          normalMap: textures.wood.normalMap,
          normalScale: new THREE.Vector2(1.25, 1.25),
          roughnessMap: textures.wood.roughnessMap,
          metalnessMap: textures.wood.specularMap,
          color: 0xffffff,
          roughness: 0.78,
          metalness: 0.14,
        }),
      ),
      roof: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.roofShingle.map,
          normalMap: textures.roofShingle.normalMap,
          normalScale: new THREE.Vector2(1.2, 1.2),
          roughnessMap: textures.roofShingle.roughnessMap,
          metalnessMap: textures.roofShingle.specularMap,
          color: 0x92400e,
          roughness: 0.74,
          metalness: 0.16,
        }),
      ),
      floor: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.wood.map,
          normalMap: textures.wood.normalMap,
          roughnessMap: textures.wood.roughnessMap,
          metalnessMap: textures.wood.specularMap,
          color: 0xd6b89c,
          roughness: 0.78,
          metalness: 0.12,
        }),
      ),
      pilaster: trimMat,
    },
    house: {
      wall: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.stucco.map,
          normalMap: textures.stucco.normalMap,
          normalScale: new THREE.Vector2(1.05, 1.05),
          roughnessMap: textures.stucco.roughnessMap,
          metalnessMap: textures.stucco.specularMap,
          color: 0xffffff,
          roughness: 0.74,
          metalness: 0.12,
        }),
      ),
      roof: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.roofShingle.map,
          normalMap: textures.roofShingle.normalMap,
          normalScale: new THREE.Vector2(1.25, 1.25),
          roughnessMap: textures.roofShingle.roughnessMap,
          metalnessMap: textures.roofShingle.specularMap,
          color: 0xdc2626,
          roughness: 0.64,
          metalness: 0.18,
        }),
      ),
      floor: trackPbr(
        new THREE.MeshStandardMaterial({
          map: textures.wood.map,
          normalMap: textures.wood.normalMap,
          roughnessMap: textures.wood.roughnessMap,
          metalnessMap: textures.wood.specularMap,
          color: 0xe6ccb2,
          roughness: 0.78,
          metalness: 0.12,
        }),
      ),
      pilaster: stoneTrimMat,
    },
  };

  function makeGabledRoofMesh(w: number, d: number, peakH: number, mat: THREE.MeshStandardMaterial): THREE.Mesh {
    const shape = new THREE.Shape();
    const hw = w / 2 + 0.75;
    shape.moveTo(-hw, 0);
    shape.lineTo(0, peakH);
    shape.lineTo(hw, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d + 1.2, bevelEnabled: false });
    geo.translate(0, 0, -(d + 1.2) / 2);
    // Normalize extruded UVs so shingles tile uniformly across sloped roof panels
    const uvAttr = geo.attributes.uv;
    if (uvAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * 0.14, uvAttr.getY(i) * 0.14);
      }
    }
    return new THREE.Mesh(geo, mat);
  }

  // Shared interior furniture & urban street prop geometries/materials
  const furnitureWoodMat = crateMat;
  const couchFabricMat = awningPalette[1];
  const bedSheetMat = awningPalette[2];
  const cushionMat = stoneTrimMat;
  const deskTopGeo = new THREE.BoxGeometry(2.1, 0.14, 1.05);
  const deskBodyGeo = new THREE.BoxGeometry(1.9, 0.72, 0.85);
  const couchBaseGeo = new THREE.BoxGeometry(2.3, 0.48, 0.95);
  const couchBackGeo = new THREE.BoxGeometry(2.3, 0.55, 0.25);
  const bedFrameGeo = new THREE.BoxGeometry(2.0, 0.45, 2.35);
  const bedMattressGeo = new THREE.BoxGeometry(1.85, 0.28, 2.15);
  const shelfBodyGeo = new THREE.BoxGeometry(1.8, 2.1, 0.55);
  const hydrantMat = awningPalette[2];
  const dumpsterMat = awningPalette[3];

  function addWindowUnit(x: number, y: number, z: number, sideFacing: boolean): THREE.Mesh[] {
    const frame = new THREE.Mesh(sideFacing ? windowFrameSideGeo : windowFrameGeo, trimMat);
    frame.position.set(x, y, z);
    const glass = new THREE.Mesh(sideFacing ? windowGlassSideGeo : windowGlassGeo, windowMat);
    glass.position.set(x + (sideFacing ? (x < 0 ? -0.04 : 0.04) : 0), y, z + (sideFacing ? 0 : z < 0 ? -0.04 : 0.04));
    const sill = new THREE.Mesh(sideFacing ? windowSillSideGeo : windowSillGeo, stoneTrimMat);
    sill.position.set(x, y - 1.12, z);
    worldGroup.add(frame, glass, sill);
    return [frame, glass, sill];
  }

  function addFurniturePiece(
    kind: 'desk' | 'couch' | 'bed' | 'shelf',
    fx: number,
    fy: number,
    fz: number,
  ) {
    if (kind === 'desk') {
      const base = new THREE.Mesh(deskBodyGeo, furnitureWoodMat);
      base.position.set(fx, fy + 0.36, fz);
      base.castShadow = true;
      const top = new THREE.Mesh(deskTopGeo, stoneTrimMat);
      top.position.set(fx, fy + 0.79, fz);
      worldGroup.add(base, top);
      const ob = addWallObstacle(fx, fz, 2.1, 1.05, fy, fy + 0.86, true);
      registerDestructible([base, top], [ob], 'prop', 45, { x: fx, y: fy + 0.5, z: fz }, true);
    } else if (kind === 'couch') {
      const base = new THREE.Mesh(couchBaseGeo, couchFabricMat);
      base.position.set(fx, fy + 0.24, fz);
      base.castShadow = true;
      const back = new THREE.Mesh(couchBackGeo, cushionMat);
      back.position.set(fx, fy + 0.62, fz - 0.35);
      worldGroup.add(base, back);
      const ob = addWallObstacle(fx, fz, 2.3, 1.0, fy, fy + 0.9, true);
      registerDestructible([base, back], [ob], 'prop', 45, { x: fx, y: fy + 0.5, z: fz }, true);
    } else if (kind === 'bed') {
      const frame = new THREE.Mesh(bedFrameGeo, furnitureWoodMat);
      frame.position.set(fx, fy + 0.22, fz);
      frame.castShadow = true;
      const matt = new THREE.Mesh(bedMattressGeo, bedSheetMat);
      matt.position.set(fx, fy + 0.55, fz);
      worldGroup.add(frame, matt);
      const ob = addWallObstacle(fx, fz, 2.0, 2.35, fy, fy + 0.72, true);
      registerDestructible([frame, matt], [ob], 'prop', 50, { x: fx, y: fy + 0.45, z: fz }, true);
    } else {
      const shelf = new THREE.Mesh(shelfBodyGeo, furnitureWoodMat);
      shelf.position.set(fx, fy + 1.05, fz);
      shelf.castShadow = true;
      worldGroup.add(shelf);
      const ob = addWallObstacle(fx, fz, 1.8, 0.58, fy, fy + 2.1, true);
      registerDestructible([shelf], [ob], 'prop', 50, { x: fx, y: fy + 1.0, z: fz }, true);
    }
  }

  function createEnterableBuilding(
    cx: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    style: BuildingStyle,
    chestCount = 3,
  ) {
    const baseY = getTerrainHeight(cx, cz);
    const wallThick = 0.7;
    const doorWidth = 4.6;
    const doorHeight = 4.2;
    const mats = styleMaterials[style];
    const structKind: DestructibleStructureDef['materialKind'] =
      style === 'house' || style === 'wood' ? 'wood' : style === 'brick' ? 'brick' : 'metal';
    const wallHp = structKind === 'wood' ? 95 : structKind === 'brick' ? 140 : 170;

    // Ground foundation plinth & sloped entry ramp remain unbreakable so entities never drop under terrain
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, 0.55, d + 1.1), foundationMat);
    plinth.position.set(cx, baseY + 0.06, cz);
    plinth.receiveShadow = true;
    worldGroup.add(plinth);

    const porchRamp = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 2.0, 0.26, 2.4), stoneTrimMat);
    porchRamp.position.set(cx, baseY + 0.17, cz + d / 2 + 1.25);
    porchRamp.rotation.x = 0.14;
    porchRamp.receiveShadow = true;
    worldGroup.add(porchRamp);
    colliderMeshes.push(porchRamp);
    addWallObstacle(cx, cz + d / 2 + 1.25, doorWidth + 2.0, 2.4, baseY - 0.1, baseY + 0.36, true, {
      axis: 'z',
      dir: -1,
      lowY: baseY,
      highY: baseY + 0.36,
    });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), mats.floor);
    floor.position.set(cx, baseY + 0.18, cz);
    floor.receiveShadow = true;
    worldGroup.add(floor);
    addWallObstacle(cx, cz, w - 0.4, d - 0.4, baseY - 0.05, baseY + 0.36, true);

    // Structural corner pilasters (destructible columns)
    const pilasterGeo = new THREE.BoxGeometry(0.75, h + 0.1, 0.75);
    const pilasters: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pil = new THREE.Mesh(pilasterGeo, mats.pilaster);
        pil.position.set(cx + sx * (w / 2), baseY + h / 2, cz + sz * (d / 2));
        pil.castShadow = true;
        pil.receiveShadow = true;
        worldGroup.add(pil);
        pilasters.push(pil);
      }
    }
    registerDestructible(pilasters, [], structKind, wallHp + 40, { x: cx, y: baseY + h / 2, z: cz });

    const stories = style === 'hangar' || style === 'hangarBlue' ? 1 : h >= 20 ? 4 : h >= 14 ? 3 : h >= 10.5 ? 2 : 1;
    const storyH = Math.min(4.8, (h - 0.5) / stories);

    // Architectural exterior belt trim between stories
    if (stories >= 2) {
      for (let st = 1; st < stories; st++) {
        const beltY = baseY + 0.36 + st * storyH;
        const beltCourse = new THREE.Mesh(new THREE.BoxGeometry(w + 0.55, 0.34, d + 0.55), stoneTrimMat);
        beltCourse.position.set(cx, beltY, cz);
        worldGroup.add(beltCourse);
        registerDestructible([beltCourse], [], structKind, wallHp, { x: cx, y: beltY, z: cz });
      }
    }

    // Roof architecture per style — EVERY roof slab + chimney is destructible AND walkable!
    if (style === 'house' || style === 'wood') {
      const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 1.5, 0.36, d + 1.5), trimMat);
      eave.position.set(cx, baseY + h + 0.12, cz);
      worldGroup.add(eave);
      const eaveOb = addWallObstacle(cx, cz, w + 1.4, d + 1.4, baseY + h - 0.1, baseY + h + 0.3, true);
      registerDestructible([eave], [eaveOb], structKind, wallHp, { x: cx, y: baseY + h + 0.12, z: cz });

      const gable = makeGabledRoofMesh(w, d, 3.6, mats.roof);
      gable.position.set(cx, baseY + h + 0.26, cz);
      gable.castShadow = true;
      gable.receiveShadow = true;
      worldGroup.add(gable);
      const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, d + 1.35), trimMat);
      ridgeCap.position.set(cx, baseY + h + 3.85, cz);
      worldGroup.add(ridgeCap);
      const g1 = addWallObstacle(cx, cz, w * 0.78, d + 1.0, baseY + h + 0.25, baseY + h + 1.65, true);
      const g2 = addWallObstacle(cx, cz, w * 0.42, d + 1.0, baseY + h + 1.6, baseY + h + 3.05, true);
      const g3 = addWallObstacle(cx, cz, w * 0.14, d + 1.0, baseY + h + 3.0, baseY + h + 3.85, true);
      registerDestructible([gable, ridgeCap], [g1, g2, g3], structKind, wallHp + 25, { x: cx, y: baseY + h + 1.9, z: cz });

      const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.6, 1.15), styleMaterials.brick.wall);
      chimney.position.set(cx + w * 0.26, baseY + h + 2.3, cz - d * 0.2);
      chimney.castShadow = true;
      const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.24, 1.4), trimMat);
      chimneyCap.position.set(cx + w * 0.26, baseY + h + 3.65, cz - d * 0.2);
      worldGroup.add(chimney, chimneyCap);
      const chimOb = addWallObstacle(cx + w * 0.26, cz - d * 0.2, 1.25, 1.25, baseY + h + 1.0, baseY + h + 3.77, true);
      registerDestructible([chimney, chimneyCap], [chimOb], 'brick', 120, { x: cx + w * 0.26, y: baseY + h + 2.3, z: cz - d * 0.2 });
    } else if (style === 'hangar' || style === 'hangarBlue') {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, 0.65, d + 1.1), mats.roof);
      roof.position.set(cx, baseY + h + 0.32, cz);
      roof.castShadow = true;
      roof.receiveShadow = true;
      worldGroup.add(roof);
      const roofOb = addWallObstacle(cx, cz, w + 1.0, d + 1.0, baseY + h - 0.05, baseY + h + 0.65, true);
      registerDestructible([roof], [roofOb], 'metal', wallHp + 20, { x: cx, y: baseY + h + 0.32, z: cz });

      const archShape = new THREE.Shape();
      const ahw = w / 2 + 0.4;
      archShape.moveTo(-ahw, 0);
      archShape.quadraticCurveTo(0, 3.8, ahw, 0);
      archShape.closePath();
      const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: d + 0.7, bevelEnabled: false, curveSegments: 14 });
      archGeo.translate(0, 0, -(d + 0.7) / 2);
      const arch = new THREE.Mesh(archGeo, mats.roof);
      arch.position.set(cx, baseY + h + 0.62, cz);
      arch.castShadow = true;
      worldGroup.add(arch);
      const a1 = addWallObstacle(cx, cz, w * 0.76, d + 0.6, baseY + h + 0.62, baseY + h + 2.0, true);
      const a2 = addWallObstacle(cx, cz, w * 0.4, d + 0.6, baseY + h + 1.95, baseY + h + 2.65, true);
      registerDestructible([arch], [a1, a2], 'metal', wallHp + 30, { x: cx, y: baseY + h + 1.6, z: cz });

      for (const vz of [-d * 0.25, d * 0.25]) {
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.9, 12), ventMat);
        vent.position.set(cx, baseY + h + 2.5, cz + vz);
        worldGroup.add(vent);
        registerDestructible([vent], [], 'metal', 70, { x: cx, y: baseY + h + 2.5, z: cz + vz });
      }
    } else {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.7, d + 0.9), mats.roof);
      roof.position.set(cx, baseY + h + 0.35, cz);
      roof.castShadow = true;
      roof.receiveShadow = true;
      worldGroup.add(roof);
      const roofOb = addWallObstacle(cx, cz, w + 0.9, d + 0.9, baseY + h - 0.05, baseY + h + 0.72, true);
      registerDestructible([roof], [roofOb], 'brick', wallHp + 30, { x: cx, y: baseY + h + 0.35, z: cz });

      const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.6, d + 1.0), stoneTrimMat);
      parapet.position.set(cx, baseY + h + 0.92, cz);
      worldGroup.add(parapet);
      const paraOb = addWallObstacle(cx, cz, w + 0.95, d + 0.95, baseY + h + 0.62, baseY + h + 1.22, true);
      registerDestructible([parapet], [paraOb], 'brick', wallHp, { x: cx, y: baseY + h + 0.92, z: cz });

      const acUnit = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.35, 1.9), ventMat);
      acUnit.position.set(cx - w * 0.22, baseY + h + 1.4, cz - d * 0.15);
      acUnit.castShadow = true;
      worldGroup.add(acUnit);
      const acOb = addWallObstacle(cx - w * 0.22, cz - d * 0.15, 2.5, 1.9, baseY + h + 1.15, baseY + h + 2.1, true);
      registerDestructible([acUnit], [acOb], 'metal', 90, { x: cx - w * 0.22, y: baseY + h + 1.4, z: cz - d * 0.15 }, true);

      // Rooftop water tower on tall brick towers
      if (stories >= 3) {
        const tankLegGeo = new THREE.BoxGeometry(0.24, 1.8, 0.24);
        const towerMeshes: THREE.Mesh[] = [];
        for (const lx of [-0.7, 0.7]) {
          for (const lz of [-0.7, 0.7]) {
            const tl = new THREE.Mesh(tankLegGeo, trimMat);
            tl.position.set(cx + w * 0.24 + lx, baseY + h + 2.1, cz - d * 0.2 + lz);
            worldGroup.add(tl);
            towerMeshes.push(tl);
          }
        }
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.9, 12), styleMaterials.wood.wall);
        tank.position.set(cx + w * 0.24, baseY + h + 3.6, cz - d * 0.2);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.9, 12), styleMaterials.brick.roof);
        cap.position.set(cx + w * 0.24, baseY + h + 4.95, cz - d * 0.2);
        worldGroup.add(tank, cap);
        towerMeshes.push(tank, cap);
        const wtOb = addWallObstacle(cx + w * 0.24, cz - d * 0.2, 2.3, 2.3, baseY + h + 1.2, baseY + h + 5.2, true);
        registerDestructible(towerMeshes, [wtOb], 'wood', 110, { x: cx + w * 0.24, y: baseY + h + 3.2, z: cz - d * 0.2 }, true);
      }
    }

    // Outer Destructible Walls (breaking any wall creates a clean breach!)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallThick), mats.wall);
    backWall.position.set(cx, baseY + h / 2, cz - d / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    worldGroup.add(backWall);
    const backOb = addWallObstacle(cx, cz - d / 2, w, wallThick, baseY, baseY + h);
    registerDestructible([backWall], [backOb], structKind, wallHp, { x: cx, y: baseY + h / 2, z: cz - d / 2 });

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, h, d), mats.wall);
    leftWall.position.set(cx - w / 2, baseY + h / 2, cz);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    worldGroup.add(leftWall);
    const leftOb = addWallObstacle(cx - w / 2, cz, wallThick, d, baseY, baseY + h);
    registerDestructible([leftWall], [leftOb], structKind, wallHp, { x: cx - w / 2, y: baseY + h / 2, z: cz });

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, h, d), mats.wall);
    rightWall.position.set(cx + w / 2, baseY + h / 2, cz);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    worldGroup.add(rightWall);
    const rightOb = addWallObstacle(cx + w / 2, cz, wallThick, d, baseY, baseY + h);
    registerDestructible([rightWall], [rightOb], structKind, wallHp, { x: cx + w / 2, y: baseY + h / 2, z: cz });

    const sideSegW = (w - doorWidth) / 2;
    if (sideSegW > 0.4) {
      const fLeft = new THREE.Mesh(new THREE.BoxGeometry(sideSegW, h, wallThick), mats.wall);
      fLeft.position.set(cx - w / 2 + sideSegW / 2, baseY + h / 2, cz + d / 2);
      fLeft.castShadow = true;
      fLeft.receiveShadow = true;
      worldGroup.add(fLeft);
      const flOb = addWallObstacle(cx - w / 2 + sideSegW / 2, cz + d / 2, sideSegW, wallThick, baseY, baseY + h);
      registerDestructible([fLeft], [flOb], structKind, wallHp, { x: cx - w / 2 + sideSegW / 2, y: baseY + h / 2, z: cz + d / 2 });

      const fRight = new THREE.Mesh(new THREE.BoxGeometry(sideSegW, h, wallThick), mats.wall);
      fRight.position.set(cx + w / 2 - sideSegW / 2, baseY + h / 2, cz + d / 2);
      fRight.castShadow = true;
      fRight.receiveShadow = true;
      worldGroup.add(fRight);
      const frOb = addWallObstacle(cx + w / 2 - sideSegW / 2, cz + d / 2, sideSegW, wallThick, baseY, baseY + h);
      registerDestructible([fRight], [frOb], structKind, wallHp, { x: cx + w / 2 - sideSegW / 2, y: baseY + h / 2, z: cz + d / 2 });
    }

    const lintelH = Math.max(0.6, h - doorHeight);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, lintelH, wallThick), mats.wall);
    lintel.position.set(cx, baseY + doorHeight + lintelH / 2, cz + d / 2);
    worldGroup.add(lintel);
    const lintelOb = addWallObstacle(cx, cz + d / 2, doorWidth, wallThick, baseY + doorHeight, baseY + h);
    registerDestructible([lintel], [lintelOb], structKind, wallHp, { x: cx, y: baseY + doorHeight + lintelH / 2, z: cz + d / 2 });

    // Framed doorway jambs, header, awning & support struts (destructible entry trim)
    const doorTrimMeshes: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.36, doorHeight, wallThick + 0.26), trimMat);
      jamb.position.set(cx + s * (doorWidth / 2 + 0.16), baseY + doorHeight / 2, cz + d / 2);
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.5), trimMat);
      bracket.rotation.x = -0.45;
      bracket.position.set(cx + s * (doorWidth / 2 + 0.2), baseY + doorHeight - 0.15, cz + d / 2 + 0.72);
      worldGroup.add(jamb, bracket);
      doorTrimMeshes.push(jamb, bracket);
    }
    const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.72, 0.34, wallThick + 0.26), trimMat);
    doorHeader.position.set(cx, baseY + doorHeight + 0.12, cz + d / 2);
    const awningMat = awningPalette[buildings.length % awningPalette.length];
    const awning = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 1.4, 0.24, 1.65), awningMat);
    awning.rotation.x = 0.22;
    awning.position.set(cx, baseY + doorHeight + 0.32, cz + d / 2 + 0.85);
    awning.castShadow = true;
    worldGroup.add(doorHeader, awning);
    doorTrimMeshes.push(doorHeader, awning);
    registerDestructible(doorTrimMeshes, [], structKind, 80, { x: cx, y: baseY + doorHeight, z: cz + d / 2 + 0.4 });

    // Suburban front porch posts / tall building rooftop radio antenna mast
    if (style === 'house') {
      const porchPosts: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, doorHeight - 0.1, 8), stoneTrimMat);
        post.position.set(cx + sx * (doorWidth / 2 + 0.52), baseY + doorHeight / 2, cz + d / 2 + 1.45);
        worldGroup.add(post);
        porchPosts.push(post);
      }
      registerDestructible(porchPosts, [], 'wood', 65, { x: cx, y: baseY + doorHeight / 2, z: cz + d / 2 + 1.45 });
    } else if (h >= 12) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 4.6, 8), ventMat);
      mast.position.set(cx + w * 0.25, baseY + h + 3.1, cz + d * 0.22);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), lampBulbMat);
      tip.position.set(cx + w * 0.25, baseY + h + 5.45, cz + d * 0.22);
      worldGroup.add(mast, tip);
      registerDestructible([mast, tip], [], 'metal', 60, { x: cx + w * 0.25, y: baseY + h + 3.1, z: cz + d * 0.22 });
    }

    // Multi-story walkable upper floors, interior switchback staircases, rooms & lighting
    const stairW = 3.2;
    const stairBayX = cx + w / 2 - 0.45 - stairW / 2;
    const stairSplitX = cx + w / 2 - 0.45 - stairW;
    const mainW = Math.max(4.0, stairSplitX - (cx - w / 2 + 0.4));
    const mainCx = (cx - w / 2 + 0.4 + stairSplitX) / 2;
    const rampRunZ = Math.min(6.4, d * 0.48);
    const frontD = Math.max(1.2, d / 2 - 0.4 - rampRunZ / 2);
    const frontCz = cz + rampRunZ / 2 + frontD / 2;
    const backCz = cz - rampRunZ / 2 - frontD / 2;

    for (let st = 0; st < stories; st++) {
      const floorY = baseY + 0.36 + st * storyH;
      const ceilingLamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 0.5), lampBulbMat);
      ceilingLamp.position.set(mainCx, Math.min(baseY + h - 0.35, floorY + storyH - 0.45), cz);
      worldGroup.add(ceilingLamp);

      // Upper floor slab with clean stairwell cutout + interior staircase up from previous floor
      if (st > 0) {
        const prevY = baseY + 0.36 + (st - 1) * storyH;
        const mainSlab = new THREE.Mesh(new THREE.BoxGeometry(mainW, 0.3, d - 0.8), mats.floor);
        mainSlab.position.set(mainCx, floorY - 0.15, cz);
        mainSlab.receiveShadow = true;
        worldGroup.add(mainSlab);
        const msOb = addWallObstacle(mainCx, cz, mainW, d - 0.8, floorY - 0.34, floorY + 0.02, true);
        registerDestructible([mainSlab], [msOb], structKind, wallHp, { x: mainCx, y: floorY - 0.15, z: cz });

        const fLand = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.3, frontD), mats.floor);
        fLand.position.set(stairBayX, floorY - 0.15, frontCz);
        worldGroup.add(fLand);
        const flOb2 = addWallObstacle(stairBayX, frontCz, stairW, frontD, floorY - 0.34, floorY + 0.02, true);
        registerDestructible([fLand], [flOb2], structKind, wallHp, { x: stairBayX, y: floorY - 0.15, z: frontCz });

        const bLand = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.3, frontD), mats.floor);
        bLand.position.set(stairBayX, floorY - 0.15, backCz);
        worldGroup.add(bLand);
        const blOb2 = addWallObstacle(stairBayX, backCz, stairW, frontD, floorY - 0.34, floorY + 0.02, true);
        registerDestructible([bLand], [blOb2], structKind, wallHp, { x: stairBayX, y: floorY - 0.15, z: backCz });

        // Walkable sloped interior staircase connecting prevY -> floorY
        const dir: 1 | -1 = st % 2 === 1 ? -1 : 1;
        const dy = floorY - prevY;
        const rampLen = Math.hypot(rampRunZ, dy);
        const slopeAngle = Math.atan2(dy, rampRunZ);
        const stairMesh = new THREE.Mesh(new THREE.BoxGeometry(stairW - 0.25, 0.26, rampLen), mats.floor);
        stairMesh.position.set(stairBayX, (prevY + floorY) * 0.5 - 0.06, cz);
        stairMesh.rotation.x = dir === -1 ? slopeAngle : -slopeAngle;
        stairMesh.castShadow = true;
        stairMesh.receiveShadow = true;
        const railMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, rampLen), trimMat);
        railMesh.position.set(stairSplitX + 0.1, (prevY + floorY) * 0.5 + 0.42, cz);
        railMesh.rotation.x = stairMesh.rotation.x;
        worldGroup.add(stairMesh, railMesh);
        const stairOb = addWallObstacle(stairBayX, cz, stairW - 0.2, rampRunZ + 0.5, prevY - 0.2, floorY + 0.04, true, {
          axis: 'z',
          dir,
          lowY: prevY,
          highY: floorY,
        });
        registerDestructible([stairMesh, railMesh], [stairOb], structKind, 95, {
          x: stairBayX,
          y: (prevY + floorY) * 0.5,
          z: cz,
        });

        // Interior room partition wall on wider buildings
        if (mainW >= 8.5) {
          const partW = Math.max(2.0, mainW - 3.6);
          const partWall = new THREE.Mesh(new THREE.BoxGeometry(partW, storyH - 0.4, 0.36), mats.wall);
          const partX = cx - w / 2 + 0.45 + partW / 2;
          partWall.position.set(partX, floorY + (storyH - 0.4) / 2, cz);
          worldGroup.add(partWall);
          const partOb = addWallObstacle(partX, cz, partW, 0.36, floorY, floorY + storyH - 0.4);
          registerDestructible([partWall], [partOb], structKind, 75, { x: partX, y: floorY + 2.0, z: cz });
        }
      }

      // Furnish every story cleanly away from doorway & stairwell
      const fxLeft = cx - w / 2 + 1.8;
      if (style === 'house') {
        addFurniturePiece(st === 0 ? 'couch' : 'bed', fxLeft + 0.3, floorY, cz - d * 0.24);
        addFurniturePiece('desk', mainCx - 0.5, floorY, cz + d * 0.22);
      } else if (style === 'brick') {
        addFurniturePiece('desk', fxLeft + 0.4, floorY, cz - d * 0.22);
        addFurniturePiece(st % 2 === 0 ? 'couch' : 'shelf', fxLeft + 0.3, floorY, cz + d * 0.22);
      } else if (style === 'wood') {
        addFurniturePiece('shelf', fxLeft, floorY, cz - d * 0.24);
      }

      // Destructible glass windows per floor
      const wy = floorY + 2.35;
      if (wy < baseY + h - 1.3) {
        for (const wx of [-w * 0.26, w * 0.26]) {
          const wm = addWindowUnit(cx + wx, wy, cz - d / 2 - wallThick * 0.5, false);
          registerDestructible(wm, [], 'glass', 40, { x: cx + wx, y: wy, z: cz - d / 2 - wallThick * 0.5 });
        }
        for (const wz of [-d * 0.24, d * 0.24]) {
          const wml = addWindowUnit(cx - w / 2 - wallThick * 0.5, wy, cz + wz, true);
          registerDestructible(wml, [], 'glass', 40, { x: cx - w / 2 - wallThick * 0.5, y: wy, z: cz + wz });
          const wmr = addWindowUnit(cx + w / 2 + wallThick * 0.5, wy, cz + wz, true);
          registerDestructible(wmr, [], 'glass', 40, { x: cx + w / 2 + wallThick * 0.5, y: wy, z: cz + wz });
        }
        if (st > 0) {
          for (const wx of [-w * 0.26, w * 0.26]) {
            const wmf = addWindowUnit(cx + wx, wy, cz + d / 2 + wallThick * 0.5, false);
            registerDestructible(wmf, [], 'glass', 40, { x: cx + wx, y: wy, z: cz + d / 2 + wallThick * 0.5 });
          }
        }
      }
    }

    // Interior corner cover props tucked out of chest & doorway paths (destructible!)
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.15, 1.3), crateMat);
    crate.position.set(cx - w * 0.4, baseY + 0.92, cz - d * 0.38);
    crate.castShadow = true;
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(cx + w * 0.4, baseY + 0.9, cz - d * 0.38);
    barrel.castShadow = true;
    worldGroup.add(crate, barrel);
    const crateOb = addWallObstacle(cx - w * 0.4, cz - d * 0.38, 1.3, 1.3, baseY + 0.3, baseY + 1.5, true);
    const barrelOb = addWallObstacle(cx + w * 0.4, cz - d * 0.38, 0.85, 0.85, baseY + 0.3, baseY + 1.48, true);
    registerDestructible([crate], [crateOb], 'prop', 45, { x: cx - w * 0.4, y: baseY + 0.92, z: cz - d * 0.38 }, true);
    registerDestructible([barrel], [barrelOb], 'prop', 45, { x: cx + w * 0.4, y: baseY + 0.9, z: cz - d * 0.38 }, true);

    const buildingIdx = buildings.length;
    buildings.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      doorX: cx,
      doorZ: cz + d / 2 + 2.6,
      thresholdZ: cz + d / 2,
    });

    const offsets = [
      { dx: -w * 0.28, dz: -d * 0.24 },
      { dx: -w * 0.08, dz: -d * 0.24 },
      { dx: -w * 0.28, dz: d * 0.2 },
      { dx: -w * 0.06, dz: d * 0.2 },
    ];
    for (let i = 0; i < chestCount; i++) {
      const off = offsets[i % offsets.length];
      const floorIdx = stories > 1 ? i % stories : 0;
      const slotY = baseY + 0.36 + floorIdx * storyH;
      buildingSlots.push({ x: cx + off.dx, y: slotY, z: cz + off.dz, buildingIdx });
    }

    // Floor loot spots: central indoor floor + porch/yard beside doorway
    floorLootSlots.push({ x: cx, y: baseY + 0.36, z: cz - d * 0.04, buildingIdx });
    if (buildingIdx % 2 === 0) {
      floorLootSlots.push({
        x: cx - 2.6,
        y: Math.max(-0.2, getTerrainHeight(cx - 2.6, cz + d / 2 + 2.8)),
        z: cz + d / 2 + 2.8,
      });
    }
  }

  // 29 Enterable Buildings -> 90 Indoor Chests across 8 POIs (with 2-4 story Tilted Towers!)
  createEnterableBuilding(-162, -55, 16, 16, 16, 'brick', 3);
  createEnterableBuilding(-128, -55, 15, 14, 15, 'brick', 3);
  createEnterableBuilding(-158, -12, 18, 22, 16, 'brick', 4);
  createEnterableBuilding(-122, -12, 14, 12, 14, 'house', 3);
  createEnterableBuilding(-140, 18, 16, 11, 14, 'brick', 3);

  createEnterableBuilding(-202, -206, 14, 7.5, 13, 'house', 3);
  createEnterableBuilding(-150, -208, 14, 7.5, 13, 'house', 3);
  createEnterableBuilding(-202, -162, 14, 7.5, 13, 'wood', 3);
  createEnterableBuilding(-150, -162, 14, 8.0, 13, 'house', 3);

  createEnterableBuilding(-10, -165, 14, 7.5, 13, 'wood', 3);
  createEnterableBuilding(-42, -142, 13, 7.0, 12, 'wood', 2);
  createEnterableBuilding(24, -145, 13, 7.0, 12, 'wood', 3);

  createEnterableBuilding(-252, 145, 15, 8.0, 12, 'wood', 3);
  createEnterableBuilding(-216, 148, 14, 7.5, 12, 'wood', 3);
  createEnterableBuilding(-205, 185, 14, 7.5, 12, 'wood', 3);
  createEnterableBuilding(-252, 190, 22, 8.0, 11, 'wood', 3);

  createEnterableBuilding(-12, 18, 15, 11, 24, 'hangar', 4);
  createEnterableBuilding(16, 18, 15, 11, 24, 'hangarBlue', 4);
  createEnterableBuilding(44, 18, 15, 11, 24, 'hangar', 4);

  createEnterableBuilding(162, -68, 16, 8.5, 14, 'house', 3);
  createEnterableBuilding(198, -68, 16, 8.5, 14, 'brick', 3);
  createEnterableBuilding(164, -24, 16, 8.5, 14, 'brick', 3);
  createEnterableBuilding(200, -24, 16, 8.5, 14, 'house', 3);

  createEnterableBuilding(-34, 175, 14, 7.5, 13, 'house', 3);
  createEnterableBuilding(10, 198, 14, 7.5, 13, 'house', 3);
  createEnterableBuilding(-10, 150, 13, 7.5, 12, 'wood', 3);

  createEnterableBuilding(165, 155, 14, 9.5, 13, 'brick', 3);
  createEnterableBuilding(204, 160, 14, 12.0, 13, 'brick', 3);
  createEnterableBuilding(185, 198, 15, 8.5, 13, 'house', 3);

  // Streetlamps & Urban Street Furniture (hydrants, benches, dumpsters) at town POIs
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 5.8, 10);
  const lampHeadGeo = new THREE.BoxGeometry(0.85, 0.25, 0.45);
  const lampCoords: Array<[number, number]> = [
    [-145, -38],
    [-135, 6],
    [-175, -184],
    [182, -45],
    [0, 38],
    [28, 38],
    [182, 176],
    [-14, 168],
  ];
  for (const [lx, lz] of lampCoords) {
    const ly = getTerrainHeight(lx, lz);
    const pole = new THREE.Mesh(poleGeo, trimMat);
    pole.position.set(lx, ly + 2.9, lz);
    pole.castShadow = true;
    const arm = new THREE.Mesh(lampHeadGeo, lampBulbMat);
    arm.position.set(lx + 0.35, ly + 5.75, lz);
    worldGroup.add(pole, arm);
    const ob = addWallObstacle(lx, lz, 0.45, 0.45, ly, ly + 5.8);
    registerDestructible([pole, arm], [ob], 'metal', 65, { x: lx, y: ly + 2.9, z: lz });
  }

  const hydrantGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.95, 10);
  const dumpsterGeo = new THREE.BoxGeometry(2.1, 1.35, 1.35);
  const benchGeo = new THREE.BoxGeometry(2.3, 0.55, 0.72);
  const urbanStreetProps: Array<{ kind: 'hydrant' | 'dumpster' | 'bench'; x: number; z: number }> = [
    { kind: 'hydrant', x: -148, z: -32 },
    { kind: 'hydrant', x: 174, z: -48 },
    { kind: 'bench', x: -136, z: -30 },
    { kind: 'bench', x: -146, z: -18 },
    { kind: 'bench', x: 182, z: -40 },
    { kind: 'dumpster', x: -166, z: -38 },
    { kind: 'dumpster', x: -124, z: -36 },
    { kind: 'dumpster', x: 190, z: -56 },
  ];
  for (const up of urbanStreetProps) {
    const uy = getTerrainHeight(up.x, up.z);
    if (up.kind === 'hydrant') {
      const hm = new THREE.Mesh(hydrantGeo, hydrantMat);
      hm.position.set(up.x, uy + 0.48, up.z);
      hm.castShadow = true;
      worldGroup.add(hm);
      const ob = addWallObstacle(up.x, up.z, 0.6, 0.6, uy, uy + 1.0, true);
      registerDestructible([hm], [ob], 'metal', 45, { x: up.x, y: uy + 0.5, z: up.z }, true);
    } else if (up.kind === 'dumpster') {
      const dm = new THREE.Mesh(dumpsterGeo, dumpsterMat);
      dm.position.set(up.x, uy + 0.68, up.z);
      dm.castShadow = true;
      worldGroup.add(dm);
      const ob = addWallObstacle(up.x, up.z, 2.1, 1.35, uy, uy + 1.35, true);
      registerDestructible([dm], [ob], 'metal', 85, { x: up.x, y: uy + 0.68, z: up.z }, true);
    } else {
      const bm = new THREE.Mesh(benchGeo, crateMat);
      bm.position.set(up.x, uy + 0.32, up.z);
      bm.castShadow = true;
      worldGroup.add(bm);
      const ob = addWallObstacle(up.x, up.z, 2.3, 0.72, uy, uy + 0.6, true);
      registerDestructible([bm], [ob], 'wood', 45, { x: up.x, y: uy + 0.35, z: up.z }, true);
    }
  }

  // Crystal Lake wooden fishing dock (solid + walkable over water)
  const dockY = 0.25;
  const dockDeck = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 14), styleMaterials.wood.floor);
  dockDeck.position.set(-10, dockY, -148);
  dockDeck.castShadow = true;
  dockDeck.receiveShadow = true;
  worldGroup.add(dockDeck);
  colliderMeshes.push(dockDeck);
  addWallObstacle(-10, -148, 4.5, 14, -0.5, dockY + 0.16, true);
  for (const px of [-2, 2]) {
    for (const pz of [-153, -148, -143]) {
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.8, 10), trimMat);
      piling.position.set(-10 + px, -0.6, pz);
      worldGroup.add(piling);
    }
  }

  // Pirate Galleon landmark moored at Pirate Cove
  const galleon = new THREE.Group();
  const shipX = -278;
  const shipZ = 166;
  const hullMat = styleMaterials.wood.wall;
  const sailMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.fabric.map,
      normalMap: textures.fabric.normalMap,
      color: 0xfef3c7,
      roughness: 0.74,
      side: THREE.DoubleSide,
    }),
  );
  const hullBody = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.6, 20), hullMat);
  hullBody.position.y = 1.6;
  hullBody.castShadow = true;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(4.2, 7.5, 4), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 1.8, 13.2);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.35, 19.2), styleMaterials.wood.floor);
  deck.position.y = 3.45;
  const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 15, 10), trimMat);
  mainMast.position.set(0, 10.5, 1);
  const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 12, 10), trimMat);
  foreMast.position.set(0, 9.0, 6.5);
  const mainSail = new THREE.Mesh(new THREE.BoxGeometry(7.6, 6.2, 0.18), sailMat);
  mainSail.position.set(0, 11.2, 1.4);
  mainSail.castShadow = true;
  const foreSail = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4.6, 0.18), sailMat);
  foreSail.position.set(0, 9.8, 6.9);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), lampBulbMat);
  lantern.position.set(0, 4.6, -9.8);
  const pirateFlag = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.3, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 }),
  );
  pirateFlag.position.set(1.1, 17.5, 1);
  galleon.add(hullBody, bow, deck, mainMast, foreMast, mainSail, foreSail, lantern, pirateFlag);
  galleon.position.set(shipX, -0.4, shipZ);
  galleon.rotation.y = 0.55;
  worldGroup.add(galleon);
  addWallObstacle(shipX, shipZ, 8.5, 22, -1, 5);

  // 8 Glowing Bounce Launch Pads across POIs
  const padBaseGeo = new THREE.CylinderGeometry(2.2, 2.55, 0.35, 20);
  const padCoreGeo = new THREE.CylinderGeometry(1.75, 1.75, 0.38, 20);
  const padRingGeo = new THREE.TorusGeometry(1.9, 0.11, 8, 24);
  const padBaseMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.gunmetal.map,
      normalMap: textures.gunmetal.normalMap,
      color: 0x1e293b,
      metalness: 0.76,
      roughness: 0.26,
    }),
  );
  const padCoreMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.9,
    roughness: 0.18,
  });
  const padRingMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.8 });

  const launchCoords: Array<[number, number]> = [
    [-140, -34],
    [-176, -184],
    [-10, -135],
    [-232, 166],
    [16, 42],
    [182, -46],
    [-12, 175],
    [185, 176],
  ];
  for (const [lx, lz] of launchCoords) {
    const ly = getTerrainHeight(lx, lz);
    const pg = new THREE.Group();
    const base = new THREE.Mesh(padBaseGeo, padBaseMat);
    base.position.y = 0.17;
    const core = new THREE.Mesh(padCoreGeo, padCoreMat);
    core.position.y = 0.2;
    const ringMesh = new THREE.Mesh(padRingGeo, padRingMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.45;
    pg.add(base, core, ringMesh);
    pg.position.set(lx, ly, lz);
    worldGroup.add(pg);
    launchPads.push({ x: lx, y: ly, z: lz, ringMesh });
  }

  // Instanced 3-Tier Pine Trees with furrowed bark + normal-mapped pine needles
  let seed = 4242;
  function rand() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  const treeTransforms: Array<{ x: number; y: number; z: number; scale: number; tint: THREE.Color }> = [];
  for (let i = 0; i < 250; i++) {
    const tx = (rand() - 0.5) * (MAP_SIZE * 0.84);
    const tz = (rand() - 0.5) * (MAP_SIZE * 0.84);
    const ty = getTerrainHeight(tx, tz);
    if (ty < 1.2) continue;

    let blocked = false;
    for (const poi of POIS) {
      if (Math.hypot(tx - poi.x, tz - poi.z) < poi.r * 0.72) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const scale = 0.85 + rand() * 0.55;
    const tint = new THREE.Color().setHSL(0.32 + (rand() - 0.5) * 0.04, 0.45, 0.65 + (rand() - 0.5) * 0.12);
    treeTransforms.push({ x: tx, y: ty, z: tz, scale, tint });
    addWallObstacle(tx, tz, 1.1 * scale, 1.1 * scale, ty, ty + 9 * scale);
  }

  const treeCount = treeTransforms.length;
  if (treeCount > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.64, 4.6, 10);
    const trunkMat = trackPbr(
      new THREE.MeshStandardMaterial({
        map: textures.bark.map,
        normalMap: textures.bark.normalMap,
        normalScale: new THREE.Vector2(1.3, 1.3),
        roughnessMap: textures.bark.roughnessMap,
        color: 0xffffff,
        roughness: 0.92,
      }),
    );
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunkInst.castShadow = true;
    trunkInst.receiveShadow = true;

    const lowerCanopyGeo = new THREE.ConeGeometry(3.3, 4.8, 9);
    const midCanopyGeo = new THREE.ConeGeometry(2.55, 4.2, 9);
    const upperCanopyGeo = new THREE.ConeGeometry(1.75, 3.6, 9);
    const leafMat = trackPbr(
      new THREE.MeshStandardMaterial({
        map: textures.foliage.map,
        normalMap: textures.foliage.normalMap,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughnessMap: textures.foliage.roughnessMap,
        color: 0xffffff,
        roughness: 0.84,
      }),
    );
    const lowerInst = new THREE.InstancedMesh(lowerCanopyGeo, leafMat, treeCount);
    const midInst = new THREE.InstancedMesh(midCanopyGeo, leafMat, treeCount);
    const upperInst = new THREE.InstancedMesh(upperCanopyGeo, leafMat, treeCount);
    lowerInst.castShadow = true;
    midInst.castShadow = true;
    upperInst.castShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < treeCount; i++) {
      const tr = treeTransforms[i];
      dummy.position.set(tr.x, tr.y + 2.2 * tr.scale, tr.z);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.scale.setScalar(tr.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tr.x, tr.y + 4.9 * tr.scale, tr.z);
      dummy.updateMatrix();
      lowerInst.setMatrixAt(i, dummy.matrix);
      lowerInst.setColorAt(i, tr.tint);

      dummy.position.set(tr.x, tr.y + 7.2 * tr.scale, tr.z);
      dummy.rotation.y += 0.4;
      dummy.updateMatrix();
      midInst.setMatrixAt(i, dummy.matrix);
      midInst.setColorAt(i, tr.tint.clone().offsetHSL(0, 0, 0.04));

      dummy.position.set(tr.x, tr.y + 9.4 * tr.scale, tr.z);
      dummy.rotation.y += 0.4;
      dummy.updateMatrix();
      upperInst.setMatrixAt(i, dummy.matrix);
      upperInst.setColorAt(i, tr.tint.clone().offsetHSL(0, 0, 0.08));
    }
    trunkInst.computeBoundingSphere();
    lowerInst.computeBoundingSphere();
    midInst.computeBoundingSphere();
    upperInst.computeBoundingSphere();
    worldGroup.add(trunkInst, lowerInst, midInst, upperInst);

    // Broadleaf Oak / Deciduous Trees & Lush Forest Bushes for realistic island biome variety
    const oakCoords: Array<{ x: number; y: number; z: number; scale: number; tint: THREE.Color }> = [];
    for (let i = 0; i < 105; i++) {
      const ox = (rand() - 0.5) * (MAP_SIZE * 0.8);
      const oz = (rand() - 0.5) * (MAP_SIZE * 0.8);
      const oy = getTerrainHeight(ox, oz);
      if (oy < 1.25) continue;
      let blocked = false;
      for (const poi of POIS) {
        if (Math.hypot(ox - poi.x, oz - poi.z) < poi.r * 0.68) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const s = 0.85 + rand() * 0.6;
      oakCoords.push({
        x: ox,
        y: oy,
        z: oz,
        scale: s,
        tint: new THREE.Color().setHSL(0.27 + (rand() - 0.5) * 0.06, 0.52, 0.55 + (rand() - 0.5) * 0.14),
      });
      addWallObstacle(ox, oz, 1.0 * s, 1.0 * s, oy, oy + 7.2 * s);
    }
    if (oakCoords.length > 0) {
      const oakTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.58, 3.8, 10), trunkMat, oakCoords.length);
      const oakCrownA = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2.45, 1), leafMat, oakCoords.length);
      const oakCrownB = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.75, 1), leafMat, oakCoords.length);
      oakTrunkInst.castShadow = oakCrownA.castShadow = oakCrownB.castShadow = true;
      oakCrownA.receiveShadow = true;
      const d2 = new THREE.Object3D();
      for (let i = 0; i < oakCoords.length; i++) {
        const oc = oakCoords[i];
        d2.position.set(oc.x, oc.y + 1.8 * oc.scale, oc.z);
        d2.rotation.set(0, i * 0.8, 0);
        d2.scale.setScalar(oc.scale);
        d2.updateMatrix();
        oakTrunkInst.setMatrixAt(i, d2.matrix);

        d2.position.set(oc.x, oc.y + 4.8 * oc.scale, oc.z);
        d2.scale.set(oc.scale * 1.15, oc.scale * 0.9, oc.scale * 1.1);
        d2.updateMatrix();
        oakCrownA.setMatrixAt(i, d2.matrix);
        oakCrownA.setColorAt(i, oc.tint);

        d2.position.set(oc.x + 0.65 * oc.scale, oc.y + 6.1 * oc.scale, oc.z - 0.45 * oc.scale);
        d2.scale.setScalar(oc.scale);
        d2.updateMatrix();
        oakCrownB.setMatrixAt(i, d2.matrix);
        oakCrownB.setColorAt(i, oc.tint.clone().offsetHSL(0.02, 0, 0.06));
      }
      oakTrunkInst.computeBoundingSphere();
      oakCrownA.computeBoundingSphere();
      oakCrownB.computeBoundingSphere();
      worldGroup.add(oakTrunkInst, oakCrownA, oakCrownB);
      foliageMeshes.push(oakCrownA, oakCrownB);
    }
  }

  // Instanced Granite Wilderness Boulders (normal-mapped rock)
  const rockGeo = new THREE.DodecahedronGeometry(1.45, 1);
  const rockMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.rock.map,
      normalMap: textures.rock.normalMap,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughnessMap: textures.rock.roughnessMap,
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.06,
    }),
  );
  const rockPositions: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number }> = [];
  for (let i = 0; i < 95; i++) {
    const rx = (rand() - 0.5) * (MAP_SIZE * 0.82);
    const rz = (rand() - 0.5) * (MAP_SIZE * 0.82);
    const ry = getTerrainHeight(rx, rz);
    if (ry < 0.2) continue;
    let blocked = false;
    for (const poi of POIS) {
      if (Math.hypot(rx - poi.x, rz - poi.z) < poi.r * 0.65) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const s = 0.8 + rand() * 0.9;
    rockPositions.push({ x: rx, y: ry, z: rz, sx: s * 1.15, sy: s * 0.75, sz: s, rot: rand() * Math.PI });
    addWallObstacle(rx, rz, 2.2 * s, 2.2 * s, ry, ry + 2.0 * s);
  }

  if (rockPositions.length > 0) {
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockPositions.length);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const rockColor = new THREE.Color();
    for (let i = 0; i < rockPositions.length; i++) {
      const rp = rockPositions[i];
      dummy.position.set(rp.x, rp.y + 0.55 * rp.sy, rp.z);
      dummy.rotation.set(0.15, rp.rot, 0.1);
      dummy.scale.set(rp.sx, rp.sy, rp.sz);
      dummy.updateMatrix();
      rockInst.setMatrixAt(i, dummy.matrix);
      rockColor.setHSL(0.6, 0.06, 0.65 + (i % 5) * 0.05);
      rockInst.setColorAt(i, rockColor);
    }
    rockInst.computeBoundingSphere();
    worldGroup.add(rockInst);
    colliderMeshes.push(rockInst);
  }

  // Instanced 3D Grass Tufts & Wilderness Shrubs (scaled by graphics quality preset)
  const grassGeo = new THREE.ConeGeometry(0.24, 0.88, 4);
  const grassMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.foliage.map,
      normalMap: textures.foliage.normalMap,
      color: 0xffffff,
      roughness: 0.86,
    }),
  );
  const grassList: Array<{ x: number; y: number; z: number; s: number; rot: number }> = [];
  for (let i = 0; i < 520; i++) {
    const gx = (rand() - 0.5) * (MAP_SIZE * 0.8);
    const gz = (rand() - 0.5) * (MAP_SIZE * 0.8);
    const gy = getTerrainHeight(gx, gz);
    if (gy < 1.2) continue;
    let inPoi = false;
    for (const poi of POIS) {
      if (Math.hypot(gx - poi.x, gz - poi.z) < poi.r * 0.56) {
        inPoi = true;
        break;
      }
    }
    if (inPoi) continue;
    grassList.push({ x: gx, y: gy, z: gz, s: 0.8 + rand() * 0.7, rot: rand() * Math.PI });
  }
  if (grassList.length > 0) {
    const grassInst = new THREE.InstancedMesh(grassGeo, grassMat, grassList.length);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let i = 0; i < grassList.length; i++) {
      const gp = grassList[i];
      dummy.position.set(gp.x, gp.y + 0.35 * gp.s, gp.z);
      dummy.rotation.set(0, gp.rot, 0);
      dummy.scale.set(gp.s, gp.s, gp.s);
      dummy.updateMatrix();
      grassInst.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.32 + (rand() - 0.5) * 0.04, 0.58, 0.58 + (rand() - 0.5) * 0.14);
      grassInst.setColorAt(i, tint);
    }
    grassInst.computeBoundingSphere();
    worldGroup.add(grassInst);
    foliageMeshes.push(grassInst);
  }

  // =========================================================================
  // ENRICHED ISLAND MAP PROPS: PAVED ROADS, WATCHTOWERS, CONTAINERS, VEHICLES, RUINS & FENCES
  // =========================================================================

  // 1. Segmented Tarmac Road Network linking major POIs
  const roadMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.asphalt.map,
      normalMap: textures.asphalt.normalMap,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: textures.asphalt.roughnessMap,
      metalnessMap: textures.asphalt.specularMap,
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.12,
    }),
  );

  const buildRoadRoute = (x1: number, z1: number, x2: number, z2: number) => {
    const totalDist = Math.hypot(x2 - x1, z2 - z1);
    const segLen = 9.0;
    const count = Math.max(2, Math.round(totalDist / segLen));
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    const segGeo = new THREE.BoxGeometry(6.8, 0.24, totalDist / count + 1.0);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const sx = x1 + (x2 - x1) * t;
      const sz = z1 + (z2 - z1) * t;
      const sy = getTerrainHeight(sx, sz);
      if (sy < 0.35) continue;
      const nextT = Math.min(1, (i + 1) / count);
      const prevT = Math.max(0, i / count);
      const yA = getTerrainHeight(x1 + (x2 - x1) * prevT, z1 + (z2 - z1) * prevT);
      const yB = getTerrainHeight(x1 + (x2 - x1) * nextT, z1 + (z2 - z1) * nextT);
      const slope = Math.atan2(yB - yA, totalDist / count);

      const seg = new THREE.Mesh(segGeo, roadMat);
      seg.position.set(sx, sy + 0.04, sz);
      seg.rotation.order = 'YXZ';
      seg.rotation.y = yaw;
      seg.rotation.x = -slope;
      seg.receiveShadow = true;
      worldGroup.add(seg);
    }
  };

  buildRoadRoute(-140, -30, 15, 52);
  buildRoadRoute(15, 52, 185, -45);
  buildRoadRoute(15, 52, -15, 185);
  buildRoadRoute(-140, -30, -175, -185);
  buildRoadRoute(185, -45, 185, 175);
  buildRoadRoute(-15, 185, -210, 165);

  // Urban concrete plazas & crosswalk stripes in Tilted Towers and Retail Row
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.72 });
  const townPlazas: Array<{ x: number; z: number; w: number; d: number }> = [
    { x: -140, z: -32, w: 48, d: 34 },
    { x: 182, z: -46, w: 46, d: 32 },
  ];
  for (const tp of townPlazas) {
    const py = getTerrainHeight(tp.x, tp.z);
    const plaza = new THREE.Mesh(new THREE.BoxGeometry(tp.w, 0.18, tp.d), stoneTrimMat);
    plaza.position.set(tp.x, py + 0.03, tp.z);
    plaza.receiveShadow = true;
    worldGroup.add(plaza);

    for (let s = -2; s <= 2; s++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 4.4), stripeMat);
      bar.position.set(tp.x + s * 2.4, py + 0.14, tp.z);
      worldGroup.add(bar);
    }
  }

  // 2. Elevated Wooden Wilderness Watchtowers (walkable lookout decks + solid roofs, destructible!)
  const towerPositions: Array<[number, number]> = [
    [-85, -105],
    [95, -110],
    [102, 95],
    [-110, 95],
    [10, -75],
  ];
  for (const [tx, tz] of towerPositions) {
    const ty = getTerrainHeight(tx, tz);
    if (ty < 0.8) continue;
    const deckH = 4.6;
    const towerMeshes: THREE.Mesh[] = [];
    for (const sx of [-1.8, 1.8]) {
      for (const sz of [-1.8, 1.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.38, deckH + 2.8, 0.38), styleMaterials.wood.wall);
        leg.position.set(tx + sx, ty + (deckH + 2.8) / 2, tz + sz);
        leg.castShadow = true;
        worldGroup.add(leg);
        towerMeshes.push(leg);
      }
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 4.4), styleMaterials.wood.floor);
    deck.position.set(tx, ty + deckH, tz);
    deck.castShadow = true;
    deck.receiveShadow = true;
    worldGroup.add(deck);
    const deckOb = addWallObstacle(tx, tz, 4.4, 4.4, ty + deckH - 0.35, ty + deckH + 0.18, true);

    const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.1, 4), styleMaterials.wood.roof);
    towerRoof.rotation.y = Math.PI / 4;
    towerRoof.position.set(tx, ty + deckH + 3.4, tz);
    towerRoof.castShadow = true;
    worldGroup.add(towerRoof);
    const roofOb = addWallObstacle(tx, tz, 4.2, 4.2, ty + deckH + 2.4, ty + deckH + 4.4, true);
    registerDestructible([...towerMeshes, deck, towerRoof], [deckOb, roofOb], 'wood', 135, { x: tx, y: ty + deckH, z: tz });

    // Sloped access ramp so players can run up onto the tower deck!
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.25, 6.2), styleMaterials.wood.floor);
    ramp.position.set(tx, ty + deckH / 2, tz + 4.4);
    ramp.rotation.x = Math.atan2(deckH, 5.2);
    worldGroup.add(ramp);
    registerDestructible([ramp], [], 'wood', 85, { x: tx, y: ty + deckH / 2, z: tz + 4.4 });
  }

  // 3. Corrugated Steel Shipping Containers (solid, walkable & destructible)
  const containerDefs: Array<{ x: number; z: number; rot: number; col: number }> = [
    { x: -32, z: 54, rot: 0.1, col: 0xdc2626 },
    { x: -32, z: 60, rot: -0.05, col: 0x0284c7 },
    { x: 52, z: 50, rot: 1.5, col: 0xd97706 },
    { x: 60, z: 50, rot: 1.52, col: 0x0f766e },
    { x: 145, z: -45, rot: 0, col: 0x2563eb },
    { x: -115, z: 12, rot: 1.57, col: 0xb91c1c },
    { x: -190, z: 155, rot: 0.4, col: 0x047857 },
  ];
  for (const cd of containerDefs) {
    const cy = getTerrainHeight(cd.x, cd.z);
    if (cy < 0.4) continue;
    const cMat = trackPbr(
      new THREE.MeshStandardMaterial({
        map: textures.metal.map,
        normalMap: textures.metal.normalMap,
        normalScale: new THREE.Vector2(1.25, 1.25),
        roughnessMap: textures.metal.roughnessMap,
        metalnessMap: textures.metal.specularMap,
        color: cd.col,
        roughness: 0.38,
        metalness: 0.62,
      }),
    );
    const box = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.8, 6.4), cMat);
    box.position.set(cd.x, cy + 1.4, cd.z);
    box.rotation.y = cd.rot;
    box.castShadow = true;
    box.receiveShadow = true;
    worldGroup.add(box);
    const isTurned = Math.abs(Math.sin(cd.rot)) > 0.7;
    const ob = addWallObstacle(cd.x, cd.z, isTurned ? 6.4 : 3.0, isTurned ? 3.0 : 6.4, cy, cy + 2.8, true);
    registerDestructible([box], [ob], 'metal', 165, { x: cd.x, y: cy + 1.4, z: cd.z }, true);
  }

  // 4. Parked Stylized Offroad Vehicles (PBR painted metal, glass, rubber tires — destructible!)
  const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.34, 14);
  const wheelMat = trackPbr(
    new THREE.MeshStandardMaterial({
      map: textures.asphalt.map,
      normalMap: textures.asphalt.normalMap,
      roughnessMap: textures.asphalt.roughnessMap,
      color: 0x1e293b,
      roughness: 0.85,
    }),
  );
  const carSpots: Array<{ x: number; z: number; rot: number; col: number }> = [
    { x: -58, z: 10, rot: 0.9, col: 0xeab308 },
    { x: 90, z: 6, rot: 1.4, col: 0xef4444 },
    { x: -135, z: -85, rot: 0.25, col: 0x3b82f6 },
    { x: 175, z: 32, rot: 0.1, col: 0x10b981 },
    { x: 6, z: 112, rot: 0.4, col: 0xf97316 },
    { x: -95, z: 175, rot: 1.35, col: 0x8b5cf6 },
  ];
  for (const cs of carSpots) {
    const cy = getTerrainHeight(cs.x, cs.z);
    if (cy < 0.4) continue;
    const vg = new THREE.Group();
    const paintMat = trackPbr(
      new THREE.MeshStandardMaterial({
        map: textures.gunmetal.map,
        normalMap: textures.gunmetal.normalMap,
        roughnessMap: textures.gunmetal.roughnessMap,
        metalnessMap: textures.gunmetal.specularMap,
        color: cs.col,
        roughness: 0.22,
        metalness: 0.65,
      }),
    );
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.92, 4.8), paintMat);
    chassis.position.y = 0.78;
    chassis.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.85, 2.3), paintMat);
    cab.position.set(0, 1.56, -0.2);
    cab.castShadow = true;
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 2.38), windowMat);
    windshield.position.set(0, 1.52, -0.2);
    vg.add(chassis, cab, windshield);

    const carMeshes: THREE.Mesh[] = [chassis, cab, windshield];
    for (const wx of [-1.15, 1.15]) {
      for (const wz of [-1.45, 1.45]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.46, wz);
        vg.add(w);
        carMeshes.push(w);
      }
    }
    vg.position.set(cs.x, cy, cs.z);
    vg.rotation.y = cs.rot;
    worldGroup.add(vg);
    const ob = addWallObstacle(cs.x, cs.z, 2.6, 4.6, cy, cy + 1.9, true);
    registerDestructible(carMeshes, [ob], 'metal', 120, { x: cs.x, y: cy + 1.0, z: cs.z }, true);
  }

  // 5. Stone Ruins, Wooden Fences & Trail Campfires across open meadows
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xea580c,
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });
  const ruinCoords: Array<[number, number]> = [
    [-75, -165],
    [82, -165],
    [-95, 45],
    [108, -22],
    [85, 145],
    [-115, 130],
  ];
  for (const [rx, rz] of ruinCoords) {
    const ry = getTerrainHeight(rx, rz);
    if (ry < 0.8) continue;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.2, 1.1), foundationMat);
    p1.position.set(rx - 2.1, ry + 2.1, rz);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.2, 1.1), foundationMat);
    p2.position.set(rx + 2.1, ry + 2.1, rz);
    const topStone = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.9, 1.25), stoneTrimMat);
    topStone.position.set(rx, ry + 4.4, rz);
    p1.castShadow = p2.castShadow = topStone.castShadow = true;
    worldGroup.add(p1, p2, topStone);
    const o1 = addWallObstacle(rx - 2.1, rz, 1.1, 1.1, ry, ry + 4.2);
    const o2 = addWallObstacle(rx + 2.1, rz, 1.1, 1.1, ry, ry + 4.2);
    const o3 = addWallObstacle(rx, rz, 5.6, 1.25, ry + 3.9, ry + 4.85, true);
    registerDestructible([p1, p2, topStone], [o1, o2, o3], 'brick', 150, { x: rx, y: ry + 2.4, z: rz });

    // Nearby campfire ring + log bench (extra Ultra detail)
    const ember = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), emberMat);
    ember.position.set(rx, ry + 0.25, rz + 3.4);
    const logSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 2.6, 8), crateMat);
    logSeat.rotation.z = Math.PI / 2;
    logSeat.position.set(rx, ry + 0.28, rz + 5.2);
    worldGroup.add(ember, logSeat);
    ultraProps.push(ember, logSeat);
  }

  // 6. Crystal River Water Surface + 3 Walkable Stone/Timber Bridges (bridge rails destructible)
  const riverSegGeo = new THREE.BoxGeometry(20, 0.25, 16);
  for (let rz = -150; rz <= 310; rz += 12) {
    const rx = getRiverCenterX(rz);
    const rSeg = new THREE.Mesh(riverSegGeo, oceanMat);
    rSeg.position.set(rx, -0.52, rz);
    rSeg.rotation.y = Math.atan2(getRiverCenterX(rz + 6) - getRiverCenterX(rz - 6), 12);
    worldGroup.add(rSeg);
  }

  for (const bz of [-58, 52, 172]) {
    const bx = getRiverCenterX(bz);
    const deckY = 1.45;
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 8.2), styleMaterials.wood.floor);
    bridgeDeck.position.set(bx, deckY, bz);
    bridgeDeck.castShadow = true;
    bridgeDeck.receiveShadow = true;
    worldGroup.add(bridgeDeck);
    colliderMeshes.push(bridgeDeck);
    addWallObstacle(bx, bz, 22, 8.2, deckY - 0.35, deckY + 0.25, true);

    for (const sz of [-3.85, 3.85]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(22, 0.95, 0.35), stoneTrimMat);
      rail.position.set(bx, deckY + 0.72, bz + sz);
      rail.castShadow = true;
      worldGroup.add(rail);
      const rOb = addWallObstacle(bx, bz + sz, 22, 0.4, deckY + 0.2, deckY + 1.2);
      registerDestructible([rail], [rOb], 'brick', 110, { x: bx, y: deckY + 0.72, z: bz + sz });
    }
    for (const sx of [-8.5, 8.5]) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.35, 7.6), styleMaterials.wood.floor);
      ramp.position.set(bx + sx + (sx > 0 ? 2.4 : -2.4), 0.72, bz);
      ramp.rotation.z = sx > 0 ? -0.26 : 0.26;
      worldGroup.add(ramp);
      colliderMeshes.push(ramp);
      addWallObstacle(
        bx + sx + (sx > 0 ? 2.4 : -2.4),
        bz,
        5.5,
        7.6,
        0.0,
        deckY + 0.2,
        true,
        { axis: 'x', dir: sx > 0 ? -1 : 1, lowY: 0.15, highY: deckY + 0.2 },
      );
    }
  }

  // 7. Tilted Clocktower Landmark (-140, -80) — destructible shaft, balcony & spire!
  {
    const tx = -140;
    const tz = -80;
    const ty = getTerrainHeight(tx, tz);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(7.2, 22, 7.2), styleMaterials.brick.wall);
    shaft.position.set(tx, ty + 11, tz);
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    worldGroup.add(shaft);
    const shaftOb = addWallObstacle(tx, tz, 7.2, 7.2, ty, ty + 22, true);
    registerDestructible([shaft], [shaftOb], 'brick', 240, { x: tx, y: ty + 11, z: tz });

    const balcony = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.6, 9.2), stoneTrimMat);
    balcony.position.set(tx, ty + 22.1, tz);
    worldGroup.add(balcony);
    const balOb = addWallObstacle(tx, tz, 9.2, 9.2, ty + 21.8, ty + 22.4, true);
    registerDestructible([balcony], [balOb], 'brick', 150, { x: tx, y: ty + 22.1, z: tz });

    const spire = new THREE.Mesh(new THREE.ConeGeometry(5.4, 7.5, 4), styleMaterials.brick.roof);
    spire.rotation.y = Math.PI / 4;
    spire.position.set(tx, ty + 26.1, tz);
    spire.castShadow = true;
    worldGroup.add(spire);
    registerDestructible([spire], [], 'brick', 140, { x: tx, y: ty + 26.1, z: tz });

    const dialMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfacc15,
      emissiveIntensity: 0.16,
      roughness: 0.45,
    });
    const dialGeo = new THREE.CylinderGeometry(1.75, 1.75, 0.24, 18);
    for (const [dx, dz, ry, rx] of [
      [0, 3.68, 0, Math.PI / 2],
      [0, -3.68, 0, Math.PI / 2],
      [3.68, 0, Math.PI / 2, Math.PI / 2],
      [-3.68, 0, Math.PI / 2, Math.PI / 2],
    ]) {
      const dial = new THREE.Mesh(dialGeo, dialMat);
      dial.position.set(tx + dx, ty + 18.8, tz + dz);
      dial.rotation.set(rx, 0, ry);
      worldGroup.add(dial);
    }
    buildingSlots.push({ x: tx - 2.2, y: ty + 22.45, z: tz + 2.2 });
  }

  // 8. Roadside Gas Station & Diner (-46, 68) — destructible canopy, columns & pumps
  {
    const gx = -46;
    const gz = 68;
    const gy = getTerrainHeight(gx, gz);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 14), foundationMat);
    pad.position.set(gx, gy + 0.12, gz);
    pad.receiveShadow = true;
    worldGroup.add(pad);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.75, 9.5), styleMaterials.hangarBlue.wall);
    canopy.position.set(gx, gy + 4.9, gz);
    canopy.castShadow = true;
    worldGroup.add(canopy);
    const canOb = addWallObstacle(gx, gz, 13.5, 9.5, gy + 4.5, gy + 5.28, true);

    const neonTrim = new THREE.Mesh(
      new THREE.BoxGeometry(13.8, 0.24, 9.8),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.32 }),
    );
    neonTrim.position.set(gx, gy + 4.9, gz);
    worldGroup.add(neonTrim);
    registerDestructible([canopy, neonTrim], [canOb], 'metal', 160, { x: gx, y: gy + 4.9, z: gz });

    for (const px of [-5.2, 5.2]) {
      for (const pz of [-3.4, 3.4]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4.6, 10), stoneTrimMat);
        col.position.set(gx + px, gy + 2.3, gz + pz);
        worldGroup.add(col);
        registerDestructible([col], [], 'metal', 90, { x: gx + px, y: gy + 2.3, z: gz + pz });
      }
    }
    for (const fx of [-2.4, 2.4]) {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.85), styleMaterials.hangar.wall);
      pump.position.set(gx + fx, gy + 1.15, gz);
      pump.castShadow = true;
      worldGroup.add(pump);
      const pOb = addWallObstacle(gx + fx, gz, 1.1, 0.85, gy, gy + 2.2);
      registerDestructible([pump], [pOb], 'metal', 70, { x: gx + fx, y: gy + 1.15, z: gz }, true);
    }
    buildingSlots.push({ x: gx, y: gy + 5.3, z: gz });
  }

  // 9. Coastal Striped Lighthouse (272, 118)
  {
    const lx = 272;
    const lz = 118;
    const ly = getTerrainHeight(lx, lz);
    const whiteMat = styleMaterials.house.wall;
    const redMat = styleMaterials.hangar.wall;
    const lhMeshes: THREE.Mesh[] = [];
    for (let ring = 0; ring < 5; ring++) {
      const rBot = 3.2 - ring * 0.25;
      const rTop = 2.95 - ring * 0.25;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBot, 3.6, 16),
        ring % 2 === 0 ? whiteMat : redMat,
      );
      seg.position.set(lx, ly + 1.8 + ring * 3.6, lz);
      seg.castShadow = true;
      worldGroup.add(seg);
      lhMeshes.push(seg);
    }
    const lhOb = addWallObstacle(lx, lz, 5.6, 5.6, ly, ly + 18, true);
    const beaconDome = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), lampBulbMat);
    beaconDome.position.set(lx, ly + 19.2, lz);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.0, 14), redMat);
    cap.position.set(lx, ly + 21.0, lz);
    worldGroup.add(beaconDome, cap);
    registerDestructible([...lhMeshes, beaconDome, cap], [lhOb], 'brick', 260, { x: lx, y: ly + 10, z: lz });
  }

  // 10. Autumn Golden Oak Biome (Eastern Highlands x > 68) + Wildflower Clusters (Ultra Props)
  const autumnCoords: Array<{ x: number; y: number; z: number; scale: number; tint: THREE.Color }> = [];
  for (let i = 0; i < 42; i++) {
    const ax = 68 + rand() * 195;
    const az = (rand() - 0.5) * 420;
    const ay = getTerrainHeight(ax, az);
    if (ay < 1.2) continue;
    let blocked = false;
    for (const poi of POIS) {
      if (Math.hypot(ax - poi.x, az - poi.z) < poi.r * 0.72) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const scale = 0.9 + rand() * 0.55;
    const tint = new THREE.Color().setHSL(0.06 + rand() * 0.08, 0.82, 0.52 + rand() * 0.12);
    autumnCoords.push({ x: ax, y: ay, z: az, scale, tint });
    addWallObstacle(ax, az, 1.0 * scale, 1.0 * scale, ay, ay + 7.0 * scale);
  }
  if (autumnCoords.length > 0) {
    const autTrunkMat = trackPbr(
      new THREE.MeshStandardMaterial({
        map: textures.bark.map,
        normalMap: textures.bark.normalMap,
        roughnessMap: textures.bark.roughnessMap,
        color: 0xffffff,
        roughness: 0.92,
      }),
    );
    const autLeafMat = trackPbr(
      new THREE.MeshStandardMaterial({
        map: textures.foliage.map,
        normalMap: textures.foliage.normalMap,
        roughnessMap: textures.foliage.roughnessMap,
        color: 0xffffff,
        roughness: 0.8,
      }),
    );
    const aTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.55, 3.9, 10), autTrunkMat, autumnCoords.length);
    const aCrowns = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2.5, 1), autLeafMat, autumnCoords.length);
    aTrunks.castShadow = aCrowns.castShadow = true;
    const d3 = new THREE.Object3D();
    for (let i = 0; i < autumnCoords.length; i++) {
      const ac = autumnCoords[i];
      d3.position.set(ac.x, ac.y + 1.9 * ac.scale, ac.z);
      d3.rotation.set(0, i * 0.6, 0);
      d3.scale.setScalar(ac.scale);
      d3.updateMatrix();
      aTrunks.setMatrixAt(i, d3.matrix);

      d3.position.set(ac.x, ac.y + 4.9 * ac.scale, ac.z);
      d3.scale.set(ac.scale * 1.15, ac.scale * 0.92, ac.scale * 1.15);
      d3.updateMatrix();
      aCrowns.setMatrixAt(i, d3.matrix);
      aCrowns.setColorAt(i, ac.tint);
    }
    aTrunks.computeBoundingSphere();
    aCrowns.computeBoundingSphere();
    worldGroup.add(aTrunks, aCrowns);
    foliageMeshes.push(aCrowns);
    ultraProps.push(aTrunks, aCrowns);
  }

  // 11. Breakable Supply Crates along roads & plazas (Harvestable with Pickaxe!)
  const crateSpots: Array<[number, number]> = [
    [-142, -32],
    [-116, -24],
    [-168, -172],
    [-22, -135],
    [16, 46],
    [-42, 58],
    [174, -42],
    [194, -36],
    [-16, 168],
    [176, 168],
    [-228, 162],
    [70, -14],
    [-75, -18],
    [95, 88],
    [-100, 92],
    [28, 128],
  ];
  const breakCrateGeo = new THREE.BoxGeometry(1.55, 1.55, 1.55);
  crateSpots.forEach(([cx, cz], idx) => {
    const cy = getTerrainHeight(cx, cz);
    if (cy < 0.25) return;
    const cm = new THREE.Mesh(breakCrateGeo, crateMat);
    cm.position.set(cx, cy + 0.78, cz);
    cm.castShadow = true;
    cm.receiveShadow = true;
    worldGroup.add(cm);
    const crOb = addWallObstacle(cx, cz, 1.55, 1.55, cy, cy + 1.55, true);
    destructibleCrates.push({ id: idx, mesh: cm, x: cx, y: cy, z: cz, hp: 50, broken: false });
    registerDestructible([cm], [crOb], 'prop', 50, { x: cx, y: cy + 0.78, z: cz }, true);
  });

  // 12. Outdoor POI Plazas, Streets, Bridges & Overlooks Floor Loot Slots
  const outdoorFloorCoords: Array<[number, number]> = [
    [-140, -34],
    [-140, -14],
    [-176, -184],
    [-162, -184],
    [-12, -146],
    [12, 34],
    [32, 34],
    [-10, 34],
    [182, -46],
    [182, -28],
    [-12, 174],
    [184, 176],
    [-232, 165],
    [-218, 168],
    [52, -18],
    [-56, -24],
    [68, 72],
    [-74, 82],
    [22, 118],
    [-34, -84],
  ];
  for (const [fx, fz] of outdoorFloorCoords) {
    const fy = getTerrainHeight(fx, fz);
    if (fy >= 0.15) {
      floorLootSlots.push({ x: fx, y: fy, z: fz });
    }
  }

  // 13. InstancedMesh 3D Meadow Grass Tufts & Wildflowers (High/Ultra visual fidelity!)
  {
    const grassCount = 520;
    const grassMat = trackPbr(
      new THREE.MeshStandardMaterial({
        map: textures.foliage.map,
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0.04,
      }),
    );
    const tuftGeo = new THREE.ConeGeometry(0.28, 0.72, 4);
    const grassInst = new THREE.InstancedMesh(tuftGeo, grassMat, grassCount);
    grassInst.receiveShadow = true;
    const gd = new THREE.Object3D();
    const gCol = new THREE.Color();
    let placed = 0;
    for (let i = 0; i < grassCount * 2 && placed < grassCount; i++) {
      const gx = (rand() - 0.5) * (MAP_SIZE - 130);
      const gz = (rand() - 0.5) * (MAP_SIZE - 130);
      const gy = getTerrainHeight(gx, gz);
      if (gy < 1.1 || gy > 7.4) continue;
      let inPoiPlaza = false;
      for (const poi of POIS) {
        if (poi.type !== 'lake' && Math.hypot(gx - poi.x, gz - poi.z) < poi.r * 0.56) {
          inPoiPlaza = true;
          break;
        }
      }
      if (inPoiPlaza) continue;
      gd.position.set(gx, gy + 0.28, gz);
      gd.rotation.set((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25);
      const sc = 0.7 + rand() * 0.95;
      gd.scale.set(sc, sc * (0.75 + rand() * 0.6), sc);
      gd.updateMatrix();
      grassInst.setMatrixAt(placed, gd.matrix);
      if (gx > 68) {
        gCol.setHSL(0.09 + rand() * 0.05, 0.68, 0.45 + rand() * 0.14);
      } else {
        gCol.setHSL(0.28 + rand() * 0.06, 0.58, 0.36 + rand() * 0.14);
      }
      grassInst.setColorAt(placed, gCol);
      placed++;
    }
    grassInst.count = placed;
    grassInst.computeBoundingSphere();
    worldGroup.add(grassInst);
    foliageMeshes.push(grassInst);
  }

  // 14. POI Reboot Vans for reviving eliminated teammates via Reboot Cards
  const vanLocations: Array<{ name: string; x: number; z: number; rotY: number }> = [
    { name: 'Tilted Towers Van', x: -118, z: -32, rotY: Math.PI * 0.2 },
    { name: 'Pleasant Park Van', x: -172, z: -162, rotY: Math.PI * 0.5 },
    { name: 'Red Hangars Van', x: 15, z: 42, rotY: 0 },
    { name: 'Retail Row Van', x: 166, z: -42, rotY: -Math.PI * 0.35 },
    { name: 'Salty Springs Van', x: -15, z: 162, rotY: Math.PI },
    { name: 'Misty Meadows Van', x: 168, z: 174, rotY: Math.PI * 0.75 },
  ];
  vanLocations.forEach((loc, idx) => {
    const vy = getTerrainHeight(loc.x, loc.z);
    if (vy < 0.2) return;
    const vanVis = createRebootVanGroup(textures);
    vanVis.group.position.set(loc.x, vy, loc.z);
    vanVis.group.rotation.y = loc.rotY;
    worldGroup.add(vanVis.group);
    addWallObstacle(loc.x, loc.z, 3.2, 4.6, vy, vy + 2.4, true);
    rebootVans.push({
      id: idx,
      name: loc.name,
      x: loc.x,
      y: vy,
      z: loc.z,
      beacon: vanVis.beacon,
      ring: vanVis.ring,
      padGlow: vanVis.padGlow,
    });
  });

  return {
    worldGroup,
    obstacles,
    buildings,
    buildingSlots,
    floorLootSlots,
    colliderMeshes,
    oceanMesh,
    clouds,
    launchPads,
    rebootVans,
    foliageMeshes,
    ultraProps,
    destructibleCrates,
    destructibles,
    pbrNormalMaterials,
  };
}

