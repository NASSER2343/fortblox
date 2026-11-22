import * as THREE from 'three';
import type { GraphicsQuality } from './types';

export interface PbrMaterialMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  specularMap: THREE.CanvasTexture;
}

export interface ProceduralTextures {
  terrainGrass: PbrMaterialMaps;
  concrete: PbrMaterialMaps;
  wood: PbrMaterialMaps;
  brick: PbrMaterialMaps;
  stucco: PbrMaterialMaps;
  roofShingle: PbrMaterialMaps;
  metal: PbrMaterialMaps;
  rock: PbrMaterialMaps;
  bark: PbrMaterialMaps;
  foliage: PbrMaterialMaps;
  fabric: PbrMaterialMaps;
  armorHex: PbrMaterialMaps;
  gunmetal: PbrMaterialMaps;
  asphalt: PbrMaterialMaps;
  skinDetail: PbrMaterialMaps;
  windowGlass: THREE.CanvasTexture;
  windowNormal: THREE.CanvasTexture;
  water: THREE.CanvasTexture;
  waterNormal: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  getLootLabelTexture: (name: string, rarityLabel: string, colorCss: string) => THREE.CanvasTexture;
  registerTierMaterial: <T extends THREE.MeshStandardMaterial>(mat: T) => T;
  applyTierQuality: (quality: GraphicsQuality) => void;
  setAnisotropy: (maxAnisotropy: number) => void;
  dispose: () => void;
}

function makeLcg(seedInit: number): () => number {
  let seed = seedInit % 2147483647;
  if (seed <= 0) seed += 2147483646;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function configureTexture(
  tex: THREE.CanvasTexture,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  isColor: boolean,
): THREE.CanvasTexture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Converts a grayscale height canvas (0..255) into a tangent-space RGB Normal Map
 * using wrap-around central finite differences so tiled textures have zero seams.
 */
function buildNormalMapFromHeightCanvas(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d', { willReadFrequently: true })!;
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d')!;
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const rowStride = w * 4;
  const inv255 = 1 / 255;

  for (let y = 0; y < h; y++) {
    const yU = (y === 0 ? h - 1 : y - 1) * rowStride;
    const yC = y * rowStride;
    const yD = (y === h - 1 ? 0 : y + 1) * rowStride;

    for (let x = 0; x < w; x++) {
      const xL = (x === 0 ? w - 1 : x - 1) * 4;
      const xC = x * 4;
      const xR = (x === w - 1 ? 0 : x + 1) * 4;

      const hL = src[yC + xL] * inv255;
      const hR = src[yC + xR] * inv255;
      const hU = src[yU + xC] * inv255;
      const hD = src[yD + xC] * inv255;

      const nx = (hL - hR) * strength;
      const ny = (hU - hD) * strength;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1.0);

      const idx = yC + xC;
      dst[idx] = (nx * invLen * 0.5 + 0.5) * 255;
      dst[idx + 1] = (ny * invLen * 0.5 + 0.5) * 255;
      dst[idx + 2] = (invLen * 0.5 + 0.5) * 255;
      dst[idx + 3] = 255;
    }
  }
  outCtx.putImageData(outImg, 0, 0);
  return configureTexture(new THREE.CanvasTexture(outCanvas), repeatX, repeatY, anisotropy, false);
}

function buildSpecularMapFromHeightAndRough(
  heightCanvas: HTMLCanvasElement,
  roughCanvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const hData = heightCanvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const rData = roughCanvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d')!;
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const total = w * h * 4;
  for (let idx = 0; idx < total; idx += 4) {
    // Raised smooth regions receive high specular reflection; deep matte crevices stay near 0
    const smooth = 255 - rData[idx];
    const heightBoost = hData[idx] * 0.45;
    const spec = Math.max(0, Math.min(255, smooth * 0.85 + heightBoost - 36));
    dst[idx] = spec;
    dst[idx + 1] = spec;
    dst[idx + 2] = spec;
    dst[idx + 3] = 255;
  }
  outCtx.putImageData(outImg, 0, 0);
  return configureTexture(new THREE.CanvasTexture(outCanvas), repeatX, repeatY, anisotropy, false);
}

function makePbrSurfaceSet(
  size: number,
  repeatX: number,
  repeatY: number,
  normalStrength: number,
  anisotropy: number,
  allTextures: THREE.Texture[],
  painter: (
    albedoCtx: CanvasRenderingContext2D,
    heightCtx: CanvasRenderingContext2D,
    roughCtx: CanvasRenderingContext2D,
    s: number,
  ) => void,
): PbrMaterialMaps {
  const cAlbedo = document.createElement('canvas');
  const cHeight = document.createElement('canvas');
  const cRough = document.createElement('canvas');
  cAlbedo.width = cHeight.width = cRough.width = size;
  cAlbedo.height = cHeight.height = cRough.height = size;

  const ctxA = cAlbedo.getContext('2d')!;
  const ctxH = cHeight.getContext('2d', { willReadFrequently: true })!;
  const ctxR = cRough.getContext('2d', { willReadFrequently: true })!;

  ctxH.fillStyle = '#808080';
  ctxH.fillRect(0, 0, size, size);
  ctxR.fillStyle = '#b8b8b8';
  ctxR.fillRect(0, 0, size, size);

  painter(ctxA, ctxH, ctxR, size);

  const map = configureTexture(new THREE.CanvasTexture(cAlbedo), repeatX, repeatY, anisotropy, true);
  const normalMap = buildNormalMapFromHeightCanvas(cHeight, normalStrength, repeatX, repeatY, anisotropy);
  const roughnessMap = configureTexture(new THREE.CanvasTexture(cRough), repeatX, repeatY, anisotropy, false);
  const specularMap = buildSpecularMapFromHeightAndRough(cHeight, cRough, repeatX, repeatY, anisotropy);

  allTextures.push(map, normalMap, roughnessMap, specularMap);
  return { map, normalMap, roughnessMap, specularMap };
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  const allTextures: THREE.Texture[] = [];
  const tierMats = new Map<
    THREE.MeshStandardMaterial,
    {
      map: THREE.Texture | null;
      normalMap: THREE.Texture | null;
      roughnessMap: THREE.Texture | null;
      metalnessMap: THREE.Texture | null;
      normalScaleX: number;
      normalScaleY: number;
      clearcoat: number;
    }
  >();

  // 1. Lush Terrain Grass, Clover & Earthy Topsoil (512x512 tiled at crisp 6.4m world scale)
  const terrainGrass = makePbrSurfaceSet(512, 128, 128, 3.8, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(101);
    a.fillStyle = '#3b7d39';
    a.fillRect(0, 0, s, s);
    r.fillStyle = '#dadada';
    r.fillRect(0, 0, s, s);

    // Rich organic meadow moss, sunlit grass & micro-soil mottling
    for (let i = 0; i < 820; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const rad = 5 + rnd() * 22;
      const roll = rnd();
      if (roll < 0.16) {
        a.fillStyle = `rgba(98, 76, 52, ${0.14 + rnd() * 0.12})`;
      } else {
        const g = Math.floor(96 + rnd() * 52);
        a.fillStyle = `rgba(${Math.floor(g * 0.44)}, ${g}, ${Math.floor(g * 0.4)}, 0.28)`;
      }
      a.beginPath();
      a.arc(x, y, rad, 0, Math.PI * 2);
      a.fill();

      const hv = Math.floor(104 + rnd() * 54);
      h.fillStyle = `rgba(${hv},${hv},${hv},0.22)`;
      h.beginPath();
      h.arc(x, y, rad * 0.75, 0, Math.PI * 2);
      h.fill();
    }

    // Fine multi-directional grass blades & micro-clover highlights
    for (let i = 0; i < 6200; i++) {
      const bx = rnd() * s;
      const by = rnd() * s;
      const len = 3 + rnd() * 5.8;
      const lean = (rnd() - 0.5) * 4.8;
      const shade = rnd();
      a.strokeStyle = shade > 0.78 ? '#6bc458' : shade > 0.34 ? '#358038' : '#1e4d22';
      a.lineWidth = 1.1;
      a.beginPath();
      a.moveTo(bx, by);
      a.lineTo(bx + lean, by - len);
      a.stroke();

      h.strokeStyle = shade > 0.5 ? '#cfcfcf' : '#565656';
      h.lineWidth = 1.1;
      h.beginPath();
      h.moveTo(bx, by);
      h.lineTo(bx + lean, by - len);
      h.stroke();
    }

    // Subtle tiny wildflower & pebble flecks
    for (let i = 0; i < 160; i++) {
      const fx = rnd() * s;
      const fy = rnd() * s;
      a.fillStyle = rnd() > 0.45 ? 'rgba(253, 224, 71, 0.35)' : 'rgba(226, 232, 240, 0.35)';
      a.fillRect(fx, fy, 1.8, 1.8);
    }
  });

  // 2. Concrete / Urban Plaza Slabs (512x512)
  const concrete = makePbrSurfaceSet(512, 3, 3, 3.0, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(202);
    a.fillStyle = '#7b8794';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#9c9c9c';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#cfcfcf';
    r.fillRect(0, 0, s, s);

    for (let i = 0; i < 4200; i++) {
      const v = Math.floor(105 + rnd() * 48);
      a.fillStyle = `rgba(${v},${v + 4},${v + 9},0.24)`;
      a.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 5, 2 + rnd() * 5);
      const hv = Math.floor(132 + rnd() * 48);
      h.fillStyle = `rgb(${hv},${hv},${hv})`;
      h.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 3, 2 + rnd() * 3);
    }

    // Expansion joint grid
    const step = s / 4;
    a.strokeStyle = '#475569';
    a.lineWidth = 4;
    h.strokeStyle = '#242424';
    h.lineWidth = 5;
    r.strokeStyle = '#f0f0f0';
    r.lineWidth = 4;
    for (let k = 0; k <= s; k += step) {
      a.beginPath();
      a.moveTo(k, 0);
      a.lineTo(k, s);
      a.moveTo(0, k);
      a.lineTo(s, k);
      a.stroke();
      h.beginPath();
      h.moveTo(k, 0);
      h.lineTo(k, s);
      h.moveTo(0, k);
      h.lineTo(s, k);
      h.stroke();
    }
  });

  // 3. Timber Wood Planks (512x512)
  const wood = makePbrSurfaceSet(512, 2, 2, 3.6, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(303);
    const plankH = 64;
    const tones = ['#9d6536', '#8d572c', '#a96e3d', '#824e25'];
    for (let row = 0; row < s / plankH; row++) {
      const y = row * plankH;
      a.fillStyle = tones[row % tones.length];
      a.fillRect(0, y, s, plankH);
      h.fillStyle = '#a4a4a4';
      h.fillRect(0, y, s, plankH);
      r.fillStyle = row % 2 === 0 ? '#c4c4c4' : '#b2b2b2';
      r.fillRect(0, y, s, plankH);

      // Wood grain fibers
      for (let g = 0; g < 36; g++) {
        const gy = y + 3 + rnd() * (plankH - 6);
        a.fillStyle = rnd() > 0.5 ? 'rgba(65, 34, 10, 0.24)' : 'rgba(255, 218, 175, 0.14)';
        a.fillRect(0, gy, s, 1.5 + rnd() * 1.5);
        h.fillStyle = rnd() > 0.5 ? '#8e8e8e' : '#b8b8b8';
        h.fillRect(0, gy, s, 1.5);
      }

      // Plank seams & knots
      a.fillStyle = '#47280f';
      a.fillRect(0, y, s, 4);
      h.fillStyle = '#202020';
      h.fillRect(0, y, s, 5);
      const seamX = Math.floor(((row % 2 === 0 ? 0.32 : 0.72) + rnd() * 0.08) * s);
      a.fillRect(seamX, y, 4, plankH);
      h.fillRect(seamX, y, 5, plankH);

      // Nail heads
      a.fillStyle = '#334155';
      h.fillStyle = '#e8e8e8';
      for (const nx of [seamX - 10, seamX + 12]) {
        a.beginPath();
        a.arc(nx, y + 14, 2.5, 0, Math.PI * 2);
        a.arc(nx, y + plankH - 14, 2.5, 0, Math.PI * 2);
        a.fill();
        h.beginPath();
        h.arc(nx, y + 14, 3, 0, Math.PI * 2);
        h.arc(nx, y + plankH - 14, 3, 0, Math.PI * 2);
        h.fill();
      }
    }
  });

  // 4. Masonry Brick & Mortar with Crisp Coursing & Limestone Specular Flecks (512x512)
  const brick = makePbrSurfaceSet(512, 3, 3, 4.8, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(404);
    a.fillStyle = '#94a3b8';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#242424';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#ececec';
    r.fillRect(0, 0, s, s);

    const shades = ['#b95043', '#a64136', '#95392f', '#c96250', '#96473d', '#b55644'];
    const rowH = 32;
    const colW = 64;
    for (let row = 0; row < s / rowH; row++) {
      const y = row * rowH;
      const off = row % 2 === 0 ? 0 : colW / 2;
      for (let col = -1; col < s / colW + 1; col++) {
        const x = col * colW + off;
        const shade = shades[Math.floor(rnd() * shades.length)];
        a.fillStyle = shade;
        a.fillRect(x + 3, y + 3, colW - 6, rowH - 6);
        // Top highlight bevel + bottom mortar shadow
        a.fillStyle = 'rgba(255,240,225,0.22)';
        a.fillRect(x + 3, y + 3, colW - 6, 4);
        a.fillStyle = 'rgba(15,8,8,0.24)';
        a.fillRect(x + 3, y + rowH - 6, colW - 6, 3);

        const bh = Math.floor(190 + rnd() * 48);
        h.fillStyle = `rgb(${bh},${bh},${bh})`;
        h.fillRect(x + 3, y + 3, colW - 6, rowH - 6);

        const br = Math.floor(165 + rnd() * 45);
        r.fillStyle = `rgb(${br},${br},${br})`;
        r.fillRect(x + 3, y + 3, colW - 6, rowH - 6);
      }
    }
    for (let i = 0; i < 2800; i++) {
      const px = rnd() * s;
      const py = rnd() * s;
      a.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.1)';
      a.fillRect(px, py, 2, 2);
      h.fillStyle = rnd() > 0.5 ? 'rgba(85,85,85,0.36)' : 'rgba(245,245,245,0.28)';
      h.fillRect(px, py, 2, 2);
    }
  });

  // 5. Architectural Clapboard Siding & Clean Stucco Trim (512x512)
  const stucco = makePbrSurfaceSet(512, 3, 2, 3.8, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(505);
    a.fillStyle = '#edf2f7';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#a0a0a0';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#c0c0c0';
    r.fillRect(0, 0, s, s);

    const boardH = 32;
    for (let y = 0; y < s; y += boardH) {
      const g = a.createLinearGradient(0, y, 0, y + boardH);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.76, '#e2e8f0');
      g.addColorStop(0.94, '#cbd5e1');
      g.addColorStop(1, '#64748b');
      a.fillStyle = g;
      a.fillRect(0, y, s, boardH);

      const hg = h.createLinearGradient(0, y, 0, y + boardH);
      hg.addColorStop(0, '#dadada');
      hg.addColorStop(0.84, '#848484');
      hg.addColorStop(1, '#1e1e1e');
      h.fillStyle = hg;
      h.fillRect(0, y, s, boardH);
    }
    // Subtle vertical joint lines every 128px
    a.fillStyle = 'rgba(71, 85, 105, 0.22)';
    h.fillStyle = '#3c3c3c';
    for (let x = 0; x < s; x += 128) {
      a.fillRect(x, 0, 2, s);
      h.fillRect(x, 0, 3, s);
    }
    for (let i = 0; i < 2200; i++) {
      a.fillStyle = rnd() > 0.5 ? 'rgba(148,163,184,0.14)' : 'rgba(255,255,255,0.22)';
      a.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  });

  // 6. Roof Shingles / Layered Architectural Slate (512x512)
  const roofShingle = makePbrSurfaceSet(512, 4, 4, 4.6, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(606);
    a.fillStyle = '#334155';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#3a3a3a';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#a0a0a0';
    r.fillRect(0, 0, s, s);

    const tileH = 32;
    const tileW = 48;
    for (let row = 0; row < s / tileH; row++) {
      const y = row * tileH;
      const off = row % 2 === 0 ? 0 : tileW / 2;
      for (let col = -1; col < s / tileW + 2; col++) {
        const x = col * tileW + off;
        const v = Math.floor(172 + rnd() * 52);
        a.fillStyle = `rgb(${v},${v - 6},${v - 8})`;
        a.fillRect(x + 2, y + 2, tileW - 4, tileH - 3);
        a.fillStyle = 'rgba(255,255,255,0.16)';
        a.fillRect(x + 2, y + 2, tileW - 4, 3);
        a.fillStyle = 'rgba(0,0,0,0.4)';
        a.fillRect(x, y + tileH - 4, tileW, 4);

        const hv = Math.floor(142 + rnd() * 68);
        h.fillStyle = `rgb(${hv},${hv},${hv})`;
        h.fillRect(x + 2, y + 2, tileW - 4, tileH - 5);
        h.fillStyle = '#1c1c1c';
        h.fillRect(x, y + tileH - 4, tileW, 4);
      }
    }
  });

  // 7. Corrugated Industrial Metal & Rivets (512x512)
  const metal = makePbrSurfaceSet(512, 3, 2, 4.5, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(707);
    a.fillStyle = '#cbd5e1';
    a.fillRect(0, 0, s, s);
    r.fillStyle = '#707070';
    r.fillRect(0, 0, s, s);

    for (let x = 0; x < s; x += 32) {
      const mg = a.createLinearGradient(x, 0, x + 32, 0);
      mg.addColorStop(0, '#94a3b8');
      mg.addColorStop(0.35, '#e2e8f0');
      mg.addColorStop(0.65, '#cbd5e1');
      mg.addColorStop(1, '#64748b');
      a.fillStyle = mg;
      a.fillRect(x, 0, 32, s);

      const hg = h.createLinearGradient(x, 0, x + 32, 0);
      hg.addColorStop(0, '#444444');
      hg.addColorStop(0.4, '#e5e5e5');
      hg.addColorStop(0.7, '#999999');
      hg.addColorStop(1, '#3a3a3a');
      h.fillStyle = hg;
      h.fillRect(x, 0, 32, s);
    }

    // Horizontal steel seams & bolts
    for (const seamY of [s * 0.25, s * 0.5, s * 0.75]) {
      a.fillStyle = '#475569';
      a.fillRect(0, seamY - 3, s, 6);
      h.fillStyle = '#222222';
      h.fillRect(0, seamY - 3, s, 6);

      for (let x = 16; x < s; x += 32) {
        a.fillStyle = '#334155';
        h.fillStyle = '#ffffff';
        for (const dy of [-12, 12]) {
          a.beginPath();
          a.arc(x, seamY + dy, 3.2, 0, Math.PI * 2);
          a.fill();
          h.beginPath();
          h.arc(x, seamY + dy, 3.5, 0, Math.PI * 2);
          h.fill();
        }
      }
    }

    // Fine brushed metal grain
    for (let i = 0; i < 650; i++) {
      a.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
      a.fillRect(rnd() * s, rnd() * s, 1, 14 + rnd() * 24);
    }
  });

  // 8. Fractured Granite Rock (512x512)
  const rock = makePbrSurfaceSet(512, 2, 2, 4.4, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(808);
    a.fillStyle = '#788291';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#909090';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#d8d8d8';
    r.fillRect(0, 0, s, s);

    for (let i = 0; i < 950; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const w = 10 + rnd() * 34;
      const ht = 8 + rnd() * 28;
      const v = Math.floor(85 + rnd() * 85);
      a.fillStyle = `rgba(${v},${v + 3},${v + 8},0.34)`;
      a.fillRect(x, y, w, ht);
      const hv = Math.floor(60 + rnd() * 145);
      h.fillStyle = `rgba(${hv},${hv},${hv},0.4)`;
      h.fillRect(x, y, w, ht);
    }
    // Rock fracture veins
    a.strokeStyle = 'rgba(30,41,59,0.5)';
    h.strokeStyle = '#181818';
    a.lineWidth = 2;
    h.lineWidth = 3;
    for (let c = 0; c < 24; c++) {
      let cx = rnd() * s;
      let cy = rnd() * s;
      a.beginPath();
      h.beginPath();
      a.moveTo(cx, cy);
      h.moveTo(cx, cy);
      for (let seg = 0; seg < 5; seg++) {
        cx += (rnd() - 0.5) * 68;
        cy += (rnd() - 0.5) * 68;
        a.lineTo(cx, cy);
        h.lineTo(cx, cy);
      }
      a.stroke();
      h.stroke();
    }
  });

  // 9. Pine Tree Furrowed Bark (512x512)
  const bark = makePbrSurfaceSet(512, 2, 3, 4.8, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(909);
    a.fillStyle = '#5c3a21';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#808080';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#e5e5e5';
    r.fillRect(0, 0, s, s);

    for (let i = 0; i < 420; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const w = 5 + rnd() * 12;
      const ht = 42 + rnd() * 110;
      const tone = rnd() > 0.45 ? '#754b2b' : '#3d2412';
      a.fillStyle = tone;
      a.fillRect(x, y, w, ht);
      h.fillStyle = tone === '#754b2b' ? '#d4d4d4' : '#303030';
      h.fillRect(x, y, w, ht);
    }
  });

  // 10. Layered Pine Foliage Needles (512x512)
  const foliage = makePbrSurfaceSet(512, 3, 3, 3.8, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(1010);
    a.fillStyle = '#2d6a36';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#707070';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#c8c8c8';
    r.fillRect(0, 0, s, s);

    for (let i = 0; i < 2800; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const ang = rnd() * Math.PI * 2;
      const len = 8 + rnd() * 12;
      a.strokeStyle = rnd() > 0.4 ? '#3b8b44' : '#1f5427';
      a.lineWidth = 2.2;
      a.beginPath();
      a.moveTo(x, y);
      a.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      a.stroke();

      h.strokeStyle = rnd() > 0.5 ? '#d0d0d0' : '#4a4a4a';
      h.lineWidth = 2.2;
      h.beginPath();
      h.moveTo(x, y);
      h.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      h.stroke();
    }
  });

  // 11. Character Tactical Ripstop Fabric (512x512)
  const fabric = makePbrSurfaceSet(512, 4, 4, 2.5, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(1111);
    a.fillStyle = '#e2e8f0';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#808080';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#d4d4d4';
    r.fillRect(0, 0, s, s);

    for (let y = 0; y < s; y += 8) {
      a.fillStyle = y % 16 === 0 ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)';
      a.fillRect(0, y, s, 2);
      h.fillStyle = y % 16 === 0 ? '#a8a8a8' : '#666666';
      h.fillRect(0, y, s, 2);
    }
    for (let x = 0; x < s; x += 8) {
      a.fillStyle = x % 16 === 0 ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)';
      a.fillRect(x, 0, 2, s);
      h.fillStyle = x % 16 === 0 ? '#a8a8a8' : '#666666';
      h.fillRect(x, 0, 2, s);
    }
    // Subtle stitched tactical seams
    a.strokeStyle = 'rgba(15,23,42,0.18)';
    a.setLineDash([6, 4]);
    a.lineWidth = 2;
    a.strokeRect(20, 20, s - 40, s - 40);
    for (let i = 0; i < 400; i++) {
      h.fillStyle = rnd() > 0.5 ? '#969696' : '#6e6e6e';
      h.fillRect(rnd() * s, rnd() * s, 2, 2);
    }
  });

  // 12. Ballistic Hex Armor Plate (512x512)
  const armorHex = makePbrSurfaceSet(512, 3, 3, 3.4, maxAnisotropy, allTextures, (a, h, r, s) => {
    a.fillStyle = '#dce3ec';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#404040';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#828282';
    r.fillRect(0, 0, s, s);

    const stepX = 32;
    const stepY = 28;
    for (let row = -1; row < s / stepY + 2; row++) {
      for (let col = -1; col < s / stepX + 2; col++) {
        const cx = col * stepX + (row % 2 === 0 ? 0 : stepX / 2);
        const cy = row * stepY;
        const rad = 13;
        const drawHex = (ctx: CanvasRenderingContext2D) => {
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2 + Math.PI / 6;
            const px = cx + Math.cos(ang) * rad;
            const py = cy + Math.sin(ang) * rad;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        };
        a.fillStyle = '#f8fafc';
        drawHex(a);
        a.fill();
        a.strokeStyle = 'rgba(15,23,42,0.22)';
        a.lineWidth = 2;
        a.stroke();

        h.fillStyle = '#dfdfdf';
        drawHex(h);
        h.fill();

        r.fillStyle = '#5c5c5c';
        drawHex(r);
        r.fill();
      }
    }
  });

  // 13. Anisotropic Brushed Gunmetal (512x512)
  const gunmetal = makePbrSurfaceSet(512, 2, 2, 2.6, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(1313);
    a.fillStyle = '#cbd5e1';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#808080';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#606060';
    r.fillRect(0, 0, s, s);

    for (let i = 0; i < 1600; i++) {
      const y = rnd() * s;
      const x = rnd() * s;
      const len = 18 + rnd() * 72;
      a.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.14)';
      a.fillRect(x, y, len, 1.4);
      h.fillStyle = rnd() > 0.5 ? '#9e9e9e' : '#646464';
      h.fillRect(x, y, len, 1.4);
    }
  });

  // 14. Reflective Framed Window Glass + Normal Map (512x512)
  const winHeightCanvas = document.createElement('canvas');
  winHeightCanvas.width = winHeightCanvas.height = 512;
  const whCtx = winHeightCanvas.getContext('2d', { willReadFrequently: true })!;
  whCtx.fillStyle = '#555555';
  whCtx.fillRect(0, 0, 512, 512);
  whCtx.strokeStyle = '#ffffff';
  whCtx.lineWidth = 34;
  whCtx.strokeRect(0, 0, 512, 512);
  whCtx.lineWidth = 16;
  whCtx.beginPath();
  whCtx.moveTo(256, 0);
  whCtx.lineTo(256, 512);
  whCtx.moveTo(0, 256);
  whCtx.lineTo(512, 256);
  whCtx.stroke();

  const winColorCanvas = document.createElement('canvas');
  winColorCanvas.width = winColorCanvas.height = 512;
  const wcCtx = winColorCanvas.getContext('2d')!;
  const wGrad = wcCtx.createLinearGradient(0, 0, 512, 512);
  wGrad.addColorStop(0, '#e0f2fe');
  wGrad.addColorStop(0.38, '#38bdf8');
  wGrad.addColorStop(1, '#082f49');
  wcCtx.fillStyle = wGrad;
  wcCtx.fillRect(0, 0, 512, 512);
  wcCtx.fillStyle = 'rgba(255,255,255,0.28)';
  wcCtx.beginPath();
  wcCtx.moveTo(40, 0);
  wcCtx.lineTo(190, 0);
  wcCtx.lineTo(48, 512);
  wcCtx.lineTo(0, 512);
  wcCtx.closePath();
  wcCtx.fill();
  wcCtx.fillStyle = 'rgba(254, 240, 138, 0.25)';
  wcCtx.fillRect(28, 260, 456, 210);
  wcCtx.strokeStyle = '#0f172a';
  wcCtx.lineWidth = 34;
  wcCtx.strokeRect(0, 0, 512, 512);
  wcCtx.lineWidth = 16;
  wcCtx.beginPath();
  wcCtx.moveTo(256, 0);
  wcCtx.lineTo(256, 512);
  wcCtx.moveTo(0, 256);
  wcCtx.lineTo(512, 256);
  wcCtx.stroke();

  const windowGlass = configureTexture(new THREE.CanvasTexture(winColorCanvas), 1, 1, maxAnisotropy, true);
  const windowNormal = buildNormalMapFromHeightCanvas(winHeightCanvas, 3.5, 1, 1, maxAnisotropy);
  allTextures.push(windowGlass, windowNormal);

  // 15. Seamless Organic Ocean Swell Albedo + Normal Map (512x512, smooth 2-5 cycle octaves without high-altitude moire)
  const waterHeightCanvas = document.createElement('canvas');
  waterHeightCanvas.width = waterHeightCanvas.height = 512;
  const watH = waterHeightCanvas.getContext('2d', { willReadFrequently: true })!;
  const waterColorCanvas = document.createElement('canvas');
  waterColorCanvas.width = waterColorCanvas.height = 512;
  const watC = waterColorCanvas.getContext('2d')!;

  const watImgH = watH.createImageData(512, 512);
  const watImgC = watC.createImageData(512, 512);
  const tau = Math.PI * 2;
  for (let py = 0; py < 512; py++) {
    const v = py / 512;
    for (let px = 0; px < 512; px++) {
      const u = px / 512;
      const w1 = Math.sin(u * tau * 2 + Math.cos(v * tau * 2) * 0.85);
      const w2 = Math.cos(v * tau * 3 - Math.sin(u * tau * 2) * 0.7);
      const w3 = Math.sin((u + v) * tau * 5) * 0.42;
      const w4 = Math.cos((u * 2 - v * 3) * tau) * 0.28;
      const wave = (w1 + w2 + w3 + w4) / 2.4; // [-1, 1], 100% tileable
      const idx = (py * 512 + px) * 4;
      const hByte = Math.max(0, Math.min(255, Math.round(128 + wave * 78)));
      watImgH.data[idx] = hByte;
      watImgH.data[idx + 1] = hByte;
      watImgH.data[idx + 2] = hByte;
      watImgH.data[idx + 3] = 255;

      const crest = Math.max(0, wave);
      const foam = crest > 0.72 ? (crest - 0.72) * 1.15 : 0;
      watImgC.data[idx] = Math.min(255, Math.round(10 + crest * 32 + foam * 130));
      watImgC.data[idx + 1] = Math.min(255, Math.round(122 + crest * 58 + foam * 95));
      watImgC.data[idx + 2] = Math.min(255, Math.round(196 + crest * 42 + foam * 40));
      watImgC.data[idx + 3] = 255;
    }
  }
  watH.putImageData(watImgH, 0, 0);
  watC.putImageData(watImgC, 0, 0);

  const water = configureTexture(new THREE.CanvasTexture(waterColorCanvas), 48, 48, maxAnisotropy, true);
  const waterNormal = buildNormalMapFromHeightCanvas(waterHeightCanvas, 1.9, 48, 48, maxAnisotropy);
  allTextures.push(water, waterNormal);

  // 16. Soft Radial Contact Shadow Disc
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.26)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 64, 64);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);
  allTextures.push(contactShadow);

  const lootLabelCache = new Map<string, THREE.CanvasTexture>();

  function getLootLabelTexture(name: string, rarityLabel: string, colorCss: string): THREE.CanvasTexture {
    const key = `${name}|${rarityLabel}|${colorCss}`;
    const existing = lootLabelCache.get(key);
    if (existing) return existing;

    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 144;
    const ctx = c.getContext('2d')!;

    const pad = 8;
    const w = c.width - pad * 2;
    const h = c.height - pad * 2;
    const r = 20;

    ctx.clearRect(0, 0, c.width, c.height);
    ctx.beginPath();
    ctx.moveTo(pad + r, pad);
    ctx.lineTo(pad + w - r, pad);
    ctx.quadraticCurveTo(pad + w, pad, pad + w, pad + r);
    ctx.lineTo(pad + w, pad + h - r);
    ctx.quadraticCurveTo(pad + w, pad + h, pad + w - r, pad + h);
    ctx.lineTo(pad + r, pad + h);
    ctx.quadraticCurveTo(pad, pad + h, pad, pad + h - r);
    ctx.lineTo(pad, pad + r);
    ctx.quadraticCurveTo(pad, pad, pad + r, pad);
    ctx.closePath();

    ctx.fillStyle = 'rgba(7, 13, 30, 0.92)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = colorCss;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 26px "Chakra Petch", "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = colorCss;
    ctx.fillText(rarityLabel.toUpperCase(), c.width / 2, 42);

    ctx.font = '900 38px "Chakra Petch", "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name.toUpperCase(), c.width / 2, 92, w - 32);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.minFilter = THREE.LinearFilter;
    lootLabelCache.set(key, tex);
    return tex;
  }

  // 17. Tarmac Asphalt Roadway with Aggregate Specular & Center Line Markings (512x512)
  const asphalt = makePbrSurfaceSet(512, 1, 6, 3.0, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(1717);
    a.fillStyle = '#2b323d';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#808080';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#c2c2c2';
    r.fillRect(0, 0, s, s);

    for (let i = 0; i < 4200; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const v = Math.floor(38 + rnd() * 44);
      a.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
      a.fillRect(x, y, 2.2, 2.2);
      const hv = Math.floor(95 + rnd() * 75);
      h.fillStyle = `rgb(${hv},${hv},${hv})`;
      h.fillRect(x, y, 2, 2);
      if (rnd() > 0.85) {
        r.fillStyle = '#707070';
        r.fillRect(x, y, 2, 2);
      }
    }
    // Road shoulder edge lines + dashed yellow center stripe
    a.fillStyle = '#cbd5e1';
    a.fillRect(14, 0, 10, s);
    a.fillRect(s - 24, 0, 10, s);
    a.fillStyle = '#facc15';
    a.fillRect(s / 2 - 7, 36, 14, 180);
    a.fillRect(s / 2 - 7, 292, 14, 180);
    r.fillStyle = '#888888';
    r.fillRect(s / 2 - 7, 36, 14, 180);
    r.fillRect(s / 2 - 7, 292, 14, 180);
  });

  // 18. Character Skin Micro-Pore Normal & Subsurface Specular Detail (256x256)
  const skinDetail = makePbrSurfaceSet(256, 2, 2, 1.4, maxAnisotropy, allTextures, (a, h, r, s) => {
    const rnd = makeLcg(1818);
    a.fillStyle = '#ffffff';
    a.fillRect(0, 0, s, s);
    h.fillStyle = '#848484';
    h.fillRect(0, 0, s, s);
    r.fillStyle = '#9a9a9a';
    r.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      a.fillStyle = rnd() > 0.5 ? 'rgba(255,244,236,0.22)' : 'rgba(220,185,165,0.16)';
      a.fillRect(x, y, 2, 2);
      const hv = Math.floor(118 + rnd() * 24);
      h.fillStyle = `rgb(${hv},${hv},${hv})`;
      h.fillRect(x, y, 2, 2);
    }
  });

  return {
    terrainGrass,
    concrete,
    wood,
    brick,
    stucco,
    roofShingle,
    metal,
    rock,
    bark,
    foliage,
    fabric,
    armorHex,
    gunmetal,
    asphalt,
    skinDetail,
    windowGlass,
    windowNormal,
    water,
    waterNormal,
    contactShadow,
    getLootLabelTexture,
    registerTierMaterial<T extends THREE.MeshStandardMaterial>(mat: T): T {
      if (!tierMats.has(mat)) {
        const phys = mat as unknown as Partial<THREE.MeshPhysicalMaterial>;
        tierMats.set(mat, {
          map: mat.map,
          normalMap: mat.normalMap,
          roughnessMap: mat.roughnessMap,
          metalnessMap: mat.metalnessMap,
          normalScaleX: mat.normalScale.x,
          normalScaleY: mat.normalScale.y,
          clearcoat: typeof phys.clearcoat === 'number' ? phys.clearcoat : 0,
        });
      }
      return mat;
    },
    applyTierQuality(quality: GraphicsQuality) {
      const normBoost = quality === 'ultra' ? 1.18 : quality === 'high' ? 1.0 : 0.65;
      for (const [mat, orig] of tierMats.entries()) {
        const phys = mat as unknown as Partial<THREE.MeshPhysicalMaterial>;
        if (quality === 'low') {
          mat.map = null;
          mat.normalMap = null;
          mat.roughnessMap = null;
          mat.metalnessMap = null;
          mat.flatShading = true;
          if (typeof phys.clearcoat === 'number') phys.clearcoat = 0;
        } else if (quality === 'medium') {
          mat.map = orig.map;
          mat.normalMap = null;
          mat.roughnessMap = null;
          mat.metalnessMap = null;
          mat.flatShading = false;
          if (typeof phys.clearcoat === 'number') phys.clearcoat = 0;
        } else {
          mat.map = orig.map;
          mat.normalMap = orig.normalMap;
          mat.roughnessMap = orig.roughnessMap;
          mat.metalnessMap = orig.metalnessMap;
          mat.flatShading = false;
          mat.normalScale.set(orig.normalScaleX * normBoost, orig.normalScaleY * normBoost);
          if (typeof phys.clearcoat === 'number') {
            phys.clearcoat = orig.clearcoat;
          }
        }
        mat.needsUpdate = true;
      }
    },
    setAnisotropy(aniso: number) {
      for (const tex of allTextures) {
        tex.anisotropy = aniso;
        tex.needsUpdate = true;
      }
    },
    dispose() {
      for (const tex of allTextures) {
        tex.dispose();
      }
      for (const tex of lootLabelCache.values()) {
        tex.dispose();
      }
      lootLabelCache.clear();
      tierMats.clear();
    },
  };
}
