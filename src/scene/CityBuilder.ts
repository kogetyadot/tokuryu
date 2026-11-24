import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DistrictId, DistrictState } from '../types/game';

export interface SearchlightHandle {
  pivot: THREE.Group;
  cone: THREE.Mesh;
  coneMat: THREE.MeshBasicMaterial;
  spotGlow: THREE.Sprite;
  baseAngle: number;
  speed: number;
}

export interface AviationBeaconHandle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  halo: THREE.Sprite;
  phaseOffset: number;
  color: 'red' | 'blue';
}

export interface DistrictRingHandle {
  ring: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
}

export interface DistrictDecayHandle {
  propsGroup: THREE.Group;
  props: THREE.Object3D[];
  beacons: THREE.Mesh[];
  beaconMat: THREE.MeshBasicMaterial;
}

export interface EmissiveEntry {
  mat: THREE.MeshStandardMaterial;
  dayIntensity: number;
  nightIntensity: number;
  decayAffected: boolean;
}

export interface NeonSignEntry {
  mat: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
  flickerSeed: number;
  districtId: DistrictId;
}

export interface DistrictGlowHandle {
  sprite: THREE.Sprite;
  spriteMat: THREE.SpriteMaterial;
  disc: THREE.Mesh;
  discMat: THREE.MeshBasicMaterial;
}

export interface CityBuildOptions {
  isLowGpu?: boolean;
}

export interface CityBuildResult {
  root: THREE.Group;
  districtGroups: Record<DistrictId, THREE.Group>;
  districtHitTargets: THREE.Mesh[];
  districtRings: Record<DistrictId, DistrictRingHandle>;
  districtGlows: Record<DistrictId, DistrictGlowHandle>;
  districtEmissiveMaterials: Record<DistrictId, EmissiveEntry[]>;
  districtDecayHandles: Record<DistrictId, DistrictDecayHandle>;
  searchlights: SearchlightHandle[];
  aviationBeacons: AviationBeaconHandle[];
  waterUniforms: {
    uTime: { value: number };
    uSkyColor: { value: THREE.Color };
    uDeepColor: { value: THREE.Color };
    uShallowColor: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uFogColor: { value: THREE.Color };
    uFogDensity: { value: number };
    uNightFactor: { value: number };
  };
  expresswayCurve: THREE.CatmullRomCurve3;
  bargeHandle: { group: THREE.Group; baseY: number };
  neonSigns: NeonSignEntry[];
  streetLampMat: THREE.MeshStandardMaterial;
  updateDistrictVisuals: (
    districts: Record<DistrictId, DistrictState>,
    selectedDistrict: DistrictId | null,
    hoveredDistrict: DistrictId | null,
    nightFactor: number,
    time: number
  ) => void;
  dispose: () => void;
}

const DISTRICT_CENTERS: Record<DistrictId, [number, number]> = {
  kasumigahama: [-16, -10],
  shintoshin: [16, -12],
  konan: [18, 14],
  sakuradai: [-18, 12],
  kurokawa: [-2, 16],
  chuo: [0, -2],
};

const DISTRICT_COLORS: Record<DistrictId, string> = {
  kasumigahama: '#f43f5e',
  shintoshin: '#38bdf8',
  konan: '#f59e0b',
  sakuradai: '#a78bfa',
  kurokawa: '#fb7185',
  chuo: '#60a5fa',
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function safeMergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geoms.length === 0) {
    return new THREE.BufferGeometry();
  }
  const normalized: THREE.BufferGeometry[] = [];
  for (const g of geoms) {
    const nonIdx = g.index ? g.toNonIndexed() : g.clone();
    if (!nonIdx.getAttribute('normal')) {
      nonIdx.computeVertexNormals();
    }
    if (!nonIdx.getAttribute('uv')) {
      const count = nonIdx.getAttribute('position').count;
      nonIdx.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    // Strip extra attributes like tangent so mergeGeometries never rejects
    for (const key of Object.keys(nonIdx.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        nonIdx.deleteAttribute(key);
      }
    }
    normalized.push(nonIdx);
    g.dispose();
  }
  const merged = mergeGeometries(normalized, false);
  for (const n of normalized) n.dispose();
  return merged ?? new THREE.BufferGeometry();
}

/**
 * Splits merged BoxGeometry arrays into side-wall faces vs top/bottom faces
 * so window textures NEVER bleed onto flat building rooftops!
 * (Each non-indexed BoxGeometry has 36 vertices: 0..5 +X, 6..11 -X, 12..17 +Y, 18..23 -Y, 24..29 +Z, 30..35 -Z)
 */
function buildBoxBuildingGeometry(boxes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const sideGeos: THREE.BufferGeometry[] = [];
  const capGeos: THREE.BufferGeometry[] = [];

  for (const box of boxes) {
    const nonIdx = box.index ? box.toNonIndexed() : box.clone();
    if (!nonIdx.getAttribute('normal')) {
      nonIdx.computeVertexNormals();
    }
    const pos = nonIdx.getAttribute('position');
    const norm = nonIdx.getAttribute('normal');
    const uv = nonIdx.getAttribute('uv');

    // BoxGeometry with 36 vertices: faces 0,1 (+X,-X), 4,5 (+Z,-Z) are sides; 2,3 (+Y,-Y) are caps
    const sidePos: number[] = [];
    const sideNorm: number[] = [];
    const sideUv: number[] = [];
    const capPos: number[] = [];
    const capNorm: number[] = [];
    const capUv: number[] = [];

    for (let i = 0; i < pos.count; i++) {
      const faceIdx = Math.floor(i / 6);
      const isCap = faceIdx === 2 || faceIdx === 3;
      const targetPos = isCap ? capPos : sidePos;
      const targetNorm = isCap ? capNorm : sideNorm;
      const targetUv = isCap ? capUv : sideUv;

      targetPos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      targetNorm.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      if (uv) {
        targetUv.push(uv.getX(i), uv.getY(i));
      } else {
        targetUv.push(0, 0);
      }
    }

    if (sidePos.length > 0) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
      sg.setAttribute('normal', new THREE.Float32BufferAttribute(sideNorm, 3));
      sg.setAttribute('uv', new THREE.Float32BufferAttribute(sideUv, 2));
      sideGeos.push(sg);
    }
    if (capPos.length > 0) {
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
      cg.setAttribute('normal', new THREE.Float32BufferAttribute(capNorm, 3));
      cg.setAttribute('uv', new THREE.Float32BufferAttribute(capUv, 2));
      capGeos.push(cg);
    }
    nonIdx.dispose();
    box.dispose();
  }

  const mergedSide = safeMergeGeometries(sideGeos);
  const mergedCap = safeMergeGeometries(capGeos);
  const sideCount = mergedSide.getAttribute('position')?.count ?? 0;
  const capCount = mergedCap.getAttribute('position')?.count ?? 0;

  const combined = mergeGeometries([mergedSide, mergedCap], true);
  mergedSide.dispose();
  mergedCap.dispose();
  if (!combined) {
    return new THREE.BufferGeometry();
  }
  combined.clearGroups();
  if (sideCount > 0) combined.addGroup(0, sideCount, 0);
  if (capCount > 0) combined.addGroup(sideCount, capCount, 1);
  return combined;
}

function makeBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotY = 0
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function makeCylinder(
  rt: number,
  rb: number,
  h: number,
  seg: number,
  x: number,
  y: number,
  z: number
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

export function createGlowSpriteTexture(
  innerColor = 'rgba(255,255,255,1)',
  midColor = 'rgba(255,255,255,0.45)',
  outerColor = 'rgba(255,255,255,0)'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.32, midColor);
  grad.addColorStop(1, outerColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWindowTexture(
  kind: 'office' | 'nightlife' | 'danchi' | 'kurokawa' | 'civic',
  maxAnisotropy: number
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const w = 256;
  const h = 512;
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = w;
  baseCanvas.height = h;
  const bCtx = baseCanvas.getContext('2d')!;

  const emCanvas = document.createElement('canvas');
  emCanvas.width = w;
  emCanvas.height = h;
  const eCtx = emCanvas.getContext('2d')!;

  const rng = mulberry32(
    kind === 'office'
      ? 101
      : kind === 'nightlife'
        ? 202
        : kind === 'danchi'
          ? 303
          : kind === 'kurokawa'
            ? 404
            : 505
  );

  // Wall base & clear emissive
  const wallFill =
    kind === 'office'
      ? '#131d2b'
      : kind === 'nightlife'
        ? '#1a1420'
        : kind === 'danchi'
          ? '#3b424c'
          : kind === 'kurokawa'
            ? '#241e1c'
            : '#2c3646';
  bCtx.fillStyle = wallFill;
  bCtx.fillRect(0, 0, w, h);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, w, h);

  if (kind === 'office') {
    const cols = 8;
    const rows = 24;
    const padX = 5;
    const padY = 5;
    const cellW = w / cols;
    const cellH = h / rows;

    // Glass mullion bands
    bCtx.fillStyle = '#1b2b3e';
    for (let r = 0; r < rows; r++) {
      bCtx.fillRect(0, r * cellH, w, 2);
    }

    for (let r = 0; r < rows; r++) {
      const floorLitBias = rng() > 0.28 ? 0.65 : 0.25;
      for (let c = 0; c < cols; c++) {
        const x = c * cellW + padX;
        const y = r * cellH + padY;
        const ww = cellW - padX * 2;
        const wh = cellH - padY * 1.4;
        const roll = rng();
        if (roll < floorLitBias) {
          const palette =
            roll < 0.28 ? '#b8f2ff' : roll < 0.5 ? '#e6f6ff' : '#ffd89a';
          bCtx.fillStyle = '#2d4760';
          bCtx.fillRect(x, y, ww, wh);
          eCtx.fillStyle = palette;
          eCtx.fillRect(x, y, ww, wh);
        } else {
          bCtx.fillStyle = '#0d1623';
          bCtx.fillRect(x, y, ww, wh);
        }
      }
    }
  } else if (kind === 'nightlife') {
    const cols = 6;
    const rows = 14;
    const cellW = w / cols;
    const cellH = h / rows;
    for (let r = 0; r < rows; r++) {
      const isGround = r >= rows - 2;
      for (let c = 0; c < cols; c++) {
        const x = c * cellW + 5;
        const y = r * cellH + 6;
        const ww = cellW - 10;
        const wh = cellH - 11;
        const roll = rng();
        if (isGround || roll < 0.66) {
          const color = isGround
            ? roll < 0.5
              ? '#ff4d8d'
              : '#ffaa3b'
            : roll < 0.22
              ? '#ff4081'
              : roll < 0.44
                ? '#ffb347'
                : roll < 0.58
                  ? '#38e8ff'
                  : '#ffd27d';
          bCtx.fillStyle = '#332234';
          bCtx.fillRect(x, y, ww, wh);
          eCtx.fillStyle = color;
          eCtx.fillRect(x, y, ww, wh);
        } else {
          bCtx.fillStyle = '#110d16';
          bCtx.fillRect(x, y, ww, wh);
        }
      }
      // Accent strip every 4 floors
      if (r % 4 === 1) {
        const stripColor = r % 8 === 1 ? '#ff3377' : '#ff9922';
        eCtx.fillStyle = stripColor;
        eCtx.fillRect(0, r * cellH, w, 3);
      }
    }
  } else if (kind === 'danchi') {
    // Iconic horizontal concrete balcony ribs + warm residential windows
    const cols = 6;
    const rows = 10;
    const cellW = w / cols;
    const cellH = h / rows;
    for (let r = 0; r < rows; r++) {
      // Concrete balcony slab band
      bCtx.fillStyle = '#606a77';
      bCtx.fillRect(0, (r + 1) * cellH - 12, w, 10);
      bCtx.fillStyle = '#293038';
      bCtx.fillRect(0, (r + 1) * cellH - 14, w, 3);

      for (let c = 0; c < cols; c++) {
        const x = c * cellW + 6;
        const y = r * cellH + 7;
        const ww = cellW - 12;
        const wh = cellH - 22;
        const roll = rng();
        if (roll < 0.54) {
          const warm =
            roll < 0.36 ? '#ffcb77' : roll < 0.48 ? '#ffe5a3' : '#9ad8ff';
          bCtx.fillStyle = '#4f463a';
          bCtx.fillRect(x, y, ww, wh);
          eCtx.fillStyle = warm;
          eCtx.fillRect(x, y, ww, wh);
        } else {
          bCtx.fillStyle = '#1f252d';
          bCtx.fillRect(x, y, ww, wh);
        }
      }
    }
  } else if (kind === 'kurokawa') {
    const cols = 5;
    const rows = 6;
    const cellW = w / cols;
    const cellH = h / rows;
    for (let r = 0; r < rows; r++) {
      const isShopFloor = r >= rows - 2;
      for (let c = 0; c < cols; c++) {
        const x = c * cellW + 7;
        const y = r * cellH + 10;
        const ww = cellW - 14;
        const wh = cellH - 18;
        const roll = rng();
        if ((isShopFloor && roll < 0.78) || roll < 0.45) {
          const glow =
            isShopFloor && roll < 0.3
              ? '#ff784f'
              : roll < 0.5
                ? '#ffc166'
                : '#ffe3a8';
          bCtx.fillStyle = '#3b2e23';
          bCtx.fillRect(x, y, ww, wh);
          eCtx.fillStyle = glow;
          eCtx.fillRect(x, y, ww, wh);
        } else {
          bCtx.fillStyle = '#171413';
          bCtx.fillRect(x, y, ww, wh);
        }
      }
      // Corrugated horizontal seam
      bCtx.fillStyle = '#1b1715';
      bCtx.fillRect(0, r * cellH, w, 3);
    }
  } else {
    // Civic / Police HQ
    const cols = 8;
    const rows = 12;
    const cellW = w / cols;
    const cellH = h / rows;
    for (let r = 0; r < rows; r++) {
      bCtx.fillStyle = '#47566b';
      bCtx.fillRect(0, r * cellH, w, 4);
      for (let c = 0; c < cols; c++) {
        const x = c * cellW + 4;
        const y = r * cellH + 7;
        const ww = cellW - 8;
        const wh = cellH - 13;
        const roll = rng();
        if (roll < 0.62) {
          const col = roll < 0.4 ? '#d9eeff' : '#9cc9ff';
          bCtx.fillStyle = '#314459';
          bCtx.fillRect(x, y, ww, wh);
          eCtx.fillStyle = col;
          eCtx.fillRect(x, y, ww, wh);
        } else {
          bCtx.fillStyle = '#1c2633';
          bCtx.fillRect(x, y, ww, wh);
        }
      }
    }
  }

  const map = new THREE.CanvasTexture(baseCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const emissiveMap = new THREE.CanvasTexture(emCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = maxAnisotropy;

  return { map, emissiveMap };
}

function createNeonSignTexture(
  text: string,
  bgColor: string,
  borderColor: string,
  textColor: string,
  vertical: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? 128 : 320;
  canvas.height = vertical ? 384 : 112;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer neon border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 6;
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 14;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  ctx.shadowColor = textColor;
  ctx.shadowBlur = 16;

  if (vertical) {
    const chars = Array.from(text);
    const fontSize = chars.length <= 2 ? 64 : chars.length <= 3 ? 54 : 44;
    ctx.font = `900 ${fontSize}px "Noto Sans JP", "Hiragino Sans", sans-serif`;
    const step = (canvas.height - 56) / Math.max(chars.length, 1);
    chars.forEach((ch, idx) => {
      const y = 28 + step * (idx + 0.5);
      ctx.fillText(ch, canvas.width / 2, y);
    });
  } else {
    const fontSize = text.length <= 4 ? 50 : text.length <= 6 ? 40 : 32;
    ctx.font = `900 ${fontSize}px "Noto Sans JP", "JetBrains Mono", sans-serif`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createRoadTexture(
  withCrosswalk: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#181d26';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle asphalt grain
  const rng = mulberry32(777);
  for (let i = 0; i < 650; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(rng() * 256, rng() * 256, 2, 2);
  }

  if (withCrosswalk) {
    ctx.fillStyle = '#d4dae4';
    for (let x = 28; x < 228; x += 26) {
      ctx.fillRect(x, 76, 14, 104);
    }
  } else {
    // Dashed center line & solid edge lines
    ctx.fillStyle = '#323b4a';
    ctx.fillRect(6, 0, 4, 256);
    ctx.fillRect(246, 0, 4, 256);

    ctx.fillStyle = '#eab308';
    for (let y = 8; y < 256; y += 44) {
      ctx.fillRect(125, y, 6, 24);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createHelipadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#242f3d';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(76, 68, 22, 120);
  ctx.fillRect(158, 68, 22, 120);
  ctx.fillRect(76, 117, 104, 22);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createDistrictPlaqueTexture(
  kanji: string,
  english: string,
  accent: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(10, 15, 26, 0.86)';
  ctx.fillRect(8, 8, 496, 144);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, 488, 136);

  ctx.fillStyle = accent;
  ctx.fillRect(12, 12, 14, 136);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 56px "Noto Sans JP", sans-serif';
  ctx.fillText(kanji, 44, 62);

  ctx.fillStyle = accent;
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillText(english.toUpperCase(), 46, 116);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSearchlightBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(210, 238, 255, 0.85)');
  grad.addColorStop(0.35, 'rgba(175, 222, 255, 0.35)');
  grad.addColorStop(1, 'rgba(140, 200, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildKaiwanCity(
  renderer: THREE.WebGLRenderer,
  options: CityBuildOptions = {}
): CityBuildResult {
  const isLowGpu = Boolean(options.isLowGpu);
  const maxAnisotropy = isLowGpu
    ? 1
    : Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const root = new THREE.Group();
  root.name = 'KaiwanCity';

  const disposables: {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  } = { geometries: [], materials: [], textures: [] };

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposables.textures.push(t);
    return t;
  };

  // Shared textures
  const glowTex = trackTex(createGlowSpriteTexture());
  const beamTex = trackTex(createSearchlightBeamTexture());
  const helipadTex = trackTex(createHelipadTexture(maxAnisotropy));
  const roadTex = trackTex(createRoadTexture(false, maxAnisotropy));
  const crosswalkTex = trackTex(createRoadTexture(true, maxAnisotropy));

  const officeWin = createWindowTexture('office', maxAnisotropy);
  const nightWin = createWindowTexture('nightlife', maxAnisotropy);
  const danchiWin = createWindowTexture('danchi', maxAnisotropy);
  const kuroWin = createWindowTexture('kurokawa', maxAnisotropy);
  const civicWin = createWindowTexture('civic', maxAnisotropy);
  for (const pair of [officeWin, nightWin, danchiWin, kuroWin, civicWin]) {
    trackTex(pair.map);
    trackTex(pair.emissiveMap);
  }

  // =========================================================================
  // 1. BAY WATER PLANE (Lightweight Custom ShaderMaterial, SwiftShader-safe)
  // =========================================================================
  const waterUniforms = {
    uTime: { value: 0 },
    uSkyColor: { value: new THREE.Color('#13213d') },
    uDeepColor: { value: new THREE.Color('#071222') },
    uShallowColor: { value: new THREE.Color('#14324e') },
    uSunDir: { value: new THREE.Vector3(0.5, 0.3, -0.7).normalize() },
    uSunColor: { value: new THREE.Color('#ffaa66') },
    uFogColor: { value: new THREE.Color('#0a1020') },
    uFogDensity: { value: 0.011 },
    uNightFactor: { value: 0.85 },
  };

  const waterMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          worldPos.y += sin(worldPos.x * 0.28 + uTime * 1.1) * 0.04;
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSkyColor;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uNightFactor;
        varying vec3 vWorldPos;

        float boxSdf(vec2 p, vec2 center, vec2 halfSize) {
          vec2 d = abs(p - center) - halfSize;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }

        void main() {
          vec2 p = vWorldPos.xz;

          // Fast dual-wave normal perturbation (2 trig calls total)
          float w1 = sin(p.x * 0.45 + p.y * 0.25 + uTime * 1.45);
          float w2 = cos(p.y * 0.52 - p.x * 0.24 - uTime * 1.25);
          vec3 N = normalize(vec3(w1 * 0.085, 1.0, w2 * 0.085));

          vec3 toCam = cameraPosition - vWorldPos;
          float dist = length(toCam);
          vec3 V = toCam / max(dist, 0.001);
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

          // Coastal shallows & subtle foam rim around island & Konan pier
          float dIsland = boxSdf(p, vec2(-1.5, -0.25), vec2(28.5, 21.75));
          float dPier = boxSdf(p, vec2(20.0, 18.0), vec2(9.5, 6.5));
          float coastDist = min(dIsland, dPier);
          float shallowFactor = 1.0 - smoothstep(0.0, 14.0, max(coastDist, 0.0));
          vec3 baseWater = mix(uDeepColor, uShallowColor, shallowFactor * 0.65);

          // Crisp wave specular shimmer
          vec3 H = normalize(uSunDir + V);
          float ndh = max(dot(N, H), 0.0);
          float spec = pow(ndh, 72.0) * 1.25 + pow(ndh, 16.0) * 0.2;

          // Waterfront neon bay tint
          float neonGlowW = exp(-abs(p.x - 16.0) * 0.08) * exp(-max(p.y - 16.0, 0.0) * 0.06);
          float neonGlowE = exp(-abs(p.x + 14.0) * 0.075) * exp(-max(-p.y - 18.0, 0.0) * 0.06);
          vec3 neonTint = (vec3(0.18, 0.78, 0.95) * neonGlowW + vec3(0.95, 0.22, 0.48) * neonGlowE)
                        * (0.65 + 0.35 * w2) * uNightFactor * 0.5;

          vec3 col = mix(baseWater, uSkyColor, fresnel * 0.6);
          col += uSunColor * spec + neonTint;

          float foam = (1.0 - smoothstep(0.0, 1.25, max(coastDist, 0.0))) * (0.45 + 0.3 * w1);
          col = mix(col, vec3(0.75, 0.86, 0.96), clamp(foam, 0.0, 1.0) * (0.45 - 0.14 * uNightFactor));

          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );

  const waterSegs = isLowGpu ? 16 : 32;
  const waterGeo = trackGeo(new THREE.PlaneGeometry(340, 340, waterSegs, waterSegs));
  waterGeo.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = -0.58;
  waterMesh.receiveShadow = false;
  root.add(waterMesh);

  // =========================================================================
  // 2. ISLAND BASE, CONCRETE SEAWALLS & KONAN PIER
  // =========================================================================
  const islandGroup = new THREE.Group();
  root.add(islandGroup);

  const concreteDeckMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#202632',
      roughness: 0.88,
      metalness: 0.08,
    })
  );
  const seawallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#313a49',
      roughness: 0.92,
      metalness: 0.05,
    })
  );
  const sidewalkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#2a3240',
      roughness: 0.85,
      metalness: 0.1,
    })
  );

  // Main peninsula slab: X [-30, 27], Z [-22, 21.5]
  const baseGeo = trackGeo(makeBox(57, 1.6, 43.5, -1.5, -0.8, -0.25));
  const baseMesh = new THREE.Mesh(baseGeo, concreteDeckMat);
  baseMesh.receiveShadow = true;
  islandGroup.add(baseMesh);

  // Concrete seawall rim & Konan jutting pier apron (X [10.5, 29.5], Z [11.5, 24.5])
  const pierParts: THREE.BufferGeometry[] = [
    makeBox(57.8, 0.42, 0.9, -1.5, -0.08, 21.6),
    makeBox(57.8, 0.42, 0.9, -1.5, -0.08, -22.1),
    makeBox(0.9, 0.42, 44.2, -30.1, -0.08, -0.25),
    makeBox(0.9, 0.42, 44.2, 27.1, -0.08, -0.25),
    // Konan concrete pier apron jutting out into Z > 22 & X > 28
    makeBox(19.0, 0.48, 13.0, 20.0, -0.16, 18.0),
    makeBox(6.5, 0.45, 7.5, 28.0, -0.18, 21.2),
  ];
  // Pier pilings in the bay
  for (let px = 12; px <= 29; px += 4.2) {
    pierParts.push(makeCylinder(0.28, 0.32, 1.6, 8, px, -0.85, 24.2));
    pierParts.push(makeCylinder(0.28, 0.32, 1.6, 8, 29.2, -0.85, 13 + (px % 9)));
  }
  const seawallMesh = new THREE.Mesh(
    trackGeo(safeMergeGeometries(pierParts)),
    seawallMat
  );
  seawallMesh.receiveShadow = true;
  seawallMesh.castShadow = true;
  islandGroup.add(seawallMesh);

  // Raised district sidewalk blocks
  const blockPads: THREE.BufferGeometry[] = [
    makeBox(15.2, 0.12, 14.5, -16.8, 0.06, -10.8), // Kasumigahama
    makeBox(15.2, 0.12, 14.5, 16.5, 0.06, -11.8), // Shintoshin
    makeBox(13.2, 0.12, 12.2, 0.0, 0.06, -2.0), // Chuo
    makeBox(15.2, 0.12, 13.5, -17.5, 0.06, 12.5), // Sakuradai
    makeBox(13.2, 0.12, 12.2, -1.2, 0.06, 15.2), // Kurokawa
    makeBox(16.2, 0.12, 13.0, 17.5, 0.06, 14.2), // Konan
  ];
  const blockMesh = new THREE.Mesh(
    trackGeo(safeMergeGeometries(blockPads)),
    sidewalkMat
  );
  blockMesh.receiveShadow = true;
  islandGroup.add(blockMesh);

  // =========================================================================
  // 3. ASPHALT ROAD GRID + CROSSWALKS
  // =========================================================================
  const roadSegments: { x: number; z: number; w: number; d: number; rotY?: number }[] = [
    // East-West boulevards
    { x: -1.5, z: 5.5, w: 54, d: 2.6 },
    { x: -1.5, z: -20.2, w: 54, d: 2.3 },
    { x: -1.5, z: 20.6, w: 50, d: 2.3 },
    { x: -16.5, z: -2.0, w: 16, d: 2.1 },
    { x: 16.5, z: -2.0, w: 16, d: 2.1 },
    // North-South avenues
    { x: -8.5, z: -0.2, w: 41.5, d: 2.6, rotY: Math.PI / 2 },
    { x: 8.5, z: -0.2, w: 41.5, d: 2.6, rotY: Math.PI / 2 },
    { x: -25.8, z: -0.2, w: 41.5, d: 2.2, rotY: Math.PI / 2 },
    { x: 25.5, z: -0.2, w: 41.5, d: 2.2, rotY: Math.PI / 2 },
  ];

  const roadGeos: THREE.BufferGeometry[] = [];
  for (const seg of roadSegments) {
    const g = new THREE.PlaneGeometry(seg.w, seg.d);
    // Scale UVs along length
    const uv = g.getAttribute('uv');
    const repX = seg.w / 6;
    for (let i = 0; i < uv.count; i++) {
      // swap/tile cleanly: roadTex has vertical dashed line along Y, so rotate plane UV
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, v, u * repX);
    }
    g.rotateX(-Math.PI / 2);
    if (seg.rotY) g.rotateY(seg.rotY);
    g.translate(seg.x, 0.02, seg.z);
    roadGeos.push(g);
  }
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.9,
      metalness: 0.05,
    })
  );
  const roadsMesh = new THREE.Mesh(
    trackGeo(safeMergeGeometries(roadGeos)),
    roadMat
  );
  roadsMesh.receiveShadow = true;
  islandGroup.add(roadsMesh);

  // Crosswalk pads at intersections
  const crossCoords: [number, number][] = [
    [-8.5, 5.5],
    [8.5, 5.5],
    [-8.5, -2.0],
    [8.5, -2.0],
    [-8.5, 20.6],
    [8.5, 20.6],
  ];
  const crossGeos: THREE.BufferGeometry[] = [];
  for (const [cx, cz] of crossCoords) {
    const g = new THREE.PlaneGeometry(2.6, 2.6);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0.028, cz);
    crossGeos.push(g);
  }
  const crossMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: crosswalkTex,
      roughness: 0.85,
    })
  );
  const crossMesh = new THREE.Mesh(
    trackGeo(safeMergeGeometries(crossGeos)),
    crossMat
  );
  crossMesh.receiveShadow = true;
  islandGroup.add(crossMesh);

  // =========================================================================
  // 4. ELEVATED BAYFRONT EXPRESSWAY (首都高スタイル)
  // =========================================================================
  const expresswayPoints = [
    new THREE.Vector3(-31.5, 3.1, 22.8),
    new THREE.Vector3(-12.0, 3.3, 23.4),
    new THREE.Vector3(9.0, 3.3, 23.2),
    new THREE.Vector3(26.5, 3.3, 22.5),
    new THREE.Vector3(30.0, 3.4, 12.0),
    new THREE.Vector3(29.2, 3.4, -4.0),
    new THREE.Vector3(27.5, 3.3, -21.0),
    new THREE.Vector3(10.0, 3.3, -23.2),
    new THREE.Vector3(-14.0, 3.3, -23.2),
    new THREE.Vector3(-31.2, 3.1, -18.0),
    new THREE.Vector3(-32.2, 3.0, 2.0),
  ];
  const expresswayCurve = new THREE.CatmullRomCurve3(expresswayPoints, true, 'catmullrom', 0.35);

  const deckMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#252c38',
      roughness: 0.85,
      metalness: 0.15,
    })
  );
  const railMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#526074',
      roughness: 0.7,
      metalness: 0.35,
    })
  );
  const streetLampMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#ffd080',
      emissive: '#ff9d2e',
      emissiveIntensity: 2.2,
      roughness: 0.2,
    })
  );

  // Build smooth segmented expressway deck, guardrails, piers, and amber lamps
  const deckGeos: THREE.BufferGeometry[] = [];
  const railGeos: THREE.BufferGeometry[] = [];
  const lampHeadGeos: THREE.BufferGeometry[] = [];
  const segCount = 110;
  const deckWidth = 2.5;
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < segCount; i++) {
    const t0 = i / segCount;
    const t1 = (i + 1) / segCount;
    const p0 = expresswayCurve.getPointAt(t0);
    const p1 = expresswayCurve.getPointAt(t1 % 1);
    const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const segLen = dir.length() + 0.12;
    const angle = Math.atan2(dir.x, dir.z);

    const segBox = new THREE.BoxGeometry(deckWidth, 0.42, segLen);
    segBox.rotateY(angle);
    segBox.translate(mid.x, mid.y - 0.21, mid.z);
    deckGeos.push(segBox);

    // Side barriers
    const tangent = dir.clone().normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
    for (const s of [-1, 1]) {
      const rBox = new THREE.BoxGeometry(0.16, 0.38, segLen);
      rBox.rotateY(angle);
      rBox.translate(
        mid.x + side.x * s * (deckWidth * 0.48),
        mid.y + 0.18,
        mid.z + side.z * s * (deckWidth * 0.48)
      );
      railGeos.push(rBox);
    }

    // Support T-piers every 5 segments
    if (i % 5 === 0) {
      const pierH = mid.y + 0.9;
      const col = new THREE.CylinderGeometry(0.32, 0.42, pierH, 8);
      col.translate(mid.x, mid.y - 0.42 - pierH / 2, mid.z);
      railGeos.push(col);

      const cap = new THREE.BoxGeometry(deckWidth * 0.9, 0.28, 0.72);
      cap.rotateY(angle);
      cap.translate(mid.x, mid.y - 0.48, mid.z);
      railGeos.push(cap);
    }

    // Highway amber lamp poles every 4 segments
    if (i % 4 === 0) {
      const poleSide = 1.12;
      const px = mid.x + side.x * poleSide;
      const pz = mid.z + side.z * poleSide;
      const pole = new THREE.CylinderGeometry(0.04, 0.05, 1.35, 6);
      pole.translate(px, mid.y + 0.68, pz);
      railGeos.push(pole);

      const arm = new THREE.BoxGeometry(0.55, 0.05, 0.05);
      arm.rotateY(angle);
      arm.translate(px - side.x * 0.24, mid.y + 1.34, pz - side.z * 0.24);
      railGeos.push(arm);

      const head = new THREE.BoxGeometry(0.24, 0.08, 0.14);
      head.rotateY(angle);
      head.translate(px - side.x * 0.44, mid.y + 1.31, pz - side.z * 0.44);
      lampHeadGeos.push(head);
    }
  }

  const expresswayDeck = new THREE.Mesh(trackGeo(safeMergeGeometries(deckGeos)), deckMat);
  expresswayDeck.castShadow = true;
  expresswayDeck.receiveShadow = true;
  root.add(expresswayDeck);

  const expresswayRails = new THREE.Mesh(trackGeo(safeMergeGeometries(railGeos)), railMat);
  expresswayRails.castShadow = true;
  root.add(expresswayRails);

  const expresswayLamps = new THREE.Mesh(
    trackGeo(safeMergeGeometries(lampHeadGeos)),
    streetLampMat
  );
  root.add(expresswayLamps);

  // =========================================================================
  // 5. DISTRICT GROUPS, PLAQUES, RINGS, LIGHTS & ARCHITECTURAL LANDMARKS
  // =========================================================================
  const districtGroups = {} as Record<DistrictId, THREE.Group>;
  const districtHitTargets: THREE.Mesh[] = [];
  const districtRings = {} as Record<DistrictId, DistrictRingHandle>;
  const districtGlows = {} as Record<DistrictId, DistrictGlowHandle>;
  const districtEmissiveMaterials = {} as Record<DistrictId, EmissiveEntry[]>;
  const districtDecayHandles = {} as Record<DistrictId, DistrictDecayHandle>;
  const searchlights: SearchlightHandle[] = [];
  const aviationBeacons: AviationBeaconHandle[] = [];
  const neonSigns: NeonSignEntry[] = [];

  const registerEmissive = (
    dId: DistrictId,
    mat: THREE.MeshStandardMaterial,
    dayIntensity: number,
    nightIntensity: number,
    decayAffected = true
  ) => {
    districtEmissiveMaterials[dId].push({
      mat,
      dayIntensity,
      nightIntensity,
      decayAffected,
    });
  };

  // Shared helper for roof details & clean concrete roof caps (preventing window bleed)
  const roofTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#343e4e',
      roughness: 0.78,
      metalness: 0.25,
    })
  );
  const darkRoofCapMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1b222e',
      roughness: 0.86,
      metalness: 0.14,
    })
  );
  const darkMetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1b222e',
      roughness: 0.6,
      metalness: 0.55,
    })
  );

  // Helper to create glowing Japanese neon sign on a building
  const addNeonSign = (
    parent: THREE.Group,
    districtId: DistrictId,
    text: string,
    x: number,
    y: number,
    z: number,
    rotY: number,
    w: number,
    h: number,
    bg: string,
    border: string,
    fg: string,
    vertical: boolean,
    seed: number
  ) => {
    const tex = trackTex(createNeonSignTexture(text, bg, border, fg, vertical, maxAnisotropy));
    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        map: tex,
        toneMapped: false,
      })
    );
    const geo = trackGeo(new THREE.BoxGeometry(w, h, 0.14));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    parent.add(mesh);

    // Additive halo behind neon sign
    const haloMat = trackMat(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: border,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(x, y, z);
    halo.scale.set(Math.max(w, h) * 1.45, Math.max(w, h) * 1.45, 1);
    parent.add(halo);

    neonSigns.push({
      mat,
      baseColor: new THREE.Color('#ffffff'),
      flickerSeed: seed,
      districtId,
    });
  };

  // Helper to create aviation obstruction beacon
  const addBeacon = (
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    color: 'red' | 'blue',
    phaseOffset: number,
    size = 0.18
  ) => {
    const hex = color === 'red' ? '#ff2a4b' : '#38bdf8';
    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        color: hex,
        toneMapped: false,
      })
    );
    const mesh = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(size, 8, 8)), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);

    const haloMat = trackMat(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: hex,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(x, y, z);
    halo.scale.set(size * 9, size * 9, 1);
    parent.add(halo);

    aviationBeacons.push({ mesh, mat, halo, phaseOffset, color });
  };

  // Helper for ground streetlamps inside districts
  const streetLampPoleGeos: THREE.BufferGeometry[] = [];
  const streetLampBulbGeos: THREE.BufferGeometry[] = [];
  const addStreetLamp = (x: number, z: number, height = 2.0) => {
    streetLampPoleGeos.push(makeCylinder(0.035, 0.05, height, 6, x, height / 2, z));
    streetLampBulbGeos.push(makeBox(0.22, 0.12, 0.22, x, height + 0.04, z));
  };

  // Build district containers, rings, plaques, and decay kits
  const districtMeta: Record<DistrictId, { kanji: string; eng: string; radius: number }> = {
    kasumigahama: { kanji: '霞ヶ浜', eng: 'KASUMIGAHAMA', radius: 7.4 },
    shintoshin: { kanji: '新都心', eng: 'SHINTOSHIN', radius: 7.6 },
    konan: { kanji: '港南埠頭', eng: 'KONAN DOCKS', radius: 7.6 },
    sakuradai: { kanji: '桜台団地', eng: 'SAKURADAI', radius: 7.4 },
    kurokawa: { kanji: '黒川裏町', eng: 'KUROKAWA', radius: 6.4 },
    chuo: { kanji: '中央官庁街', eng: 'CHUO CIVIC / T3', radius: 6.8 },
  };

  const coneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#ff6a00',
      emissive: '#ff4500',
      emissiveIntensity: 0.35,
      roughness: 0.5,
    })
  );
  const barrierMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#eab308',
      roughness: 0.65,
    })
  );
  const shutterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e242e',
      roughness: 0.92,
      metalness: 0.2,
    })
  );

  (Object.keys(DISTRICT_CENTERS) as DistrictId[]).forEach((dId, dIdx) => {
    const [cx, cz] = DISTRICT_CENTERS[dId];
    const meta = districtMeta[dId];
    const group = new THREE.Group();
    group.name = `district_${dId}`;
    group.position.set(cx, 0, cz);
    root.add(group);
    districtGroups[dId] = group;
    districtEmissiveMaterials[dId] = [];

    // Clickable hit collider disc for reliable district picking
    const hitGeo = trackGeo(new THREE.CylinderGeometry(meta.radius, meta.radius, 0.6, 20));
    const hitMat = trackMat(
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.set(cx, 0.3, cz);
    hitMesh.userData.districtId = dId;
    root.add(hitMesh);
    districtHitTargets.push(hitMesh);

    // Subtle perimeter glow ring
    const ringGeo = trackGeo(new THREE.RingGeometry(meta.radius - 0.22, meta.radius, 48));
    ringGeo.rotateX(-Math.PI / 2);
    const ringColor = new THREE.Color(DISTRICT_COLORS[dId]);
    const ringMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0.14, 0);
    group.add(ring);
    districtRings[dId] = { ring, mat: ringMat, baseColor: ringColor };

    // Sleek angled ground plaque elevated cleanly outside the district ring edge
    const plaqueTex = trackTex(
      createDistrictPlaqueTexture(meta.kanji, meta.eng, DISTRICT_COLORS[dId], maxAnisotropy)
    );
    const plaqueGeo = trackGeo(new THREE.PlaneGeometry(3.5, 1.08));
    const plaqueMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: plaqueTex,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
      })
    );
    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    const plaquePos =
      dId === 'konan'
        ? [ -2.2, 0.55, -(meta.radius + 0.55) ]
        : dId === 'kurokawa'
          ? [ meta.radius + 0.55, 0.55, 1.6 ]
          : [ 0, 0.55, meta.radius + 0.65 ];
    plaque.position.set(plaquePos[0], plaquePos[1], plaquePos[2]);
    plaque.rotation.set(-Math.PI / 3.4, 0, 0);
    group.add(plaque);

    // Lightweight additive glow sprite + soft ground illumination disc (replaces expensive per-district PointLights)
    const glowDiscGeo = trackGeo(new THREE.CircleGeometry(meta.radius * 0.92, 32));
    glowDiscGeo.rotateX(-Math.PI / 2);
    const glowDiscMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: DISTRICT_COLORS[dId],
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const glowDisc = new THREE.Mesh(glowDiscGeo, glowDiscMat);
    glowDisc.position.set(0, 0.135, 0);
    group.add(glowDisc);

    const glowSpriteMat = trackMat(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: DISTRICT_COLORS[dId],
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const glowSprite = new THREE.Sprite(glowSpriteMat);
    glowSprite.position.set(0, 3.8, 0);
    glowSprite.scale.set(meta.radius * 2.1, meta.radius * 1.45, 1);
    group.add(glowSprite);

    districtGlows[dId] = {
      sprite: glowSprite,
      spriteMat: glowSpriteMat,
      disc: glowDisc,
      discMat: glowDiscMat,
    };

    // Social Decay (社会被害度) indicators: cones, barricades, shutters & warning beacons
    const decayGroup = new THREE.Group();
    group.add(decayGroup);
    const decayProps: THREE.Object3D[] = [];
    const decayBeacons: THREE.Mesh[] = [];
    const decayBeaconMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: '#ef4444',
        toneMapped: false,
      })
    );

    const decayRng = mulberry32(800 + dIdx * 37);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + decayRng() * 0.5;
      const dist = meta.radius * (0.48 + decayRng() * 0.34);
      const px = Math.cos(ang) * dist;
      const pz = Math.sin(ang) * dist;

      const cluster = new THREE.Group();
      cluster.position.set(px, 0.12, pz);
      cluster.rotation.y = decayRng() * Math.PI;

      // Traffic cones
      const c1 = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.14, 0.42, 6)), coneMat);
      c1.position.set(-0.35, 0.21, 0);
      const c2 = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.14, 0.42, 6)), coneMat);
      c2.position.set(0.35, 0.21, 0.1);
      cluster.add(c1, c2);

      // Barricade sawhorse
      const bar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.9, 0.32, 0.12)), barrierMat);
      bar.position.set(0, 0.22, -0.15);
      cluster.add(bar);

      // Shuttered storefront block on some clusters
      if (i % 2 === 1) {
        const board = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(1.1, 0.75, 0.16)),
          shutterMat
        );
        board.position.set(0, 0.4, 0.32);
        cluster.add(board);
      }

      // Flashing hazard warning beacon
      const beacon = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.11, 8, 8)),
        decayBeaconMat
      );
      beacon.position.set(0, 0.56, -0.15);
      cluster.add(beacon);
      decayBeacons.push(beacon);

      cluster.visible = false;
      decayGroup.add(cluster);
      decayProps.push(cluster);
    }

    districtDecayHandles[dId] = {
      propsGroup: decayGroup,
      props: decayProps,
      beacons: decayBeacons,
      beaconMat: decayBeaconMat,
    };
  });

  // =========================================================================
  // DISTRICT 1: KASUMIGAHAMA (霞ヶ浜 / Neon Nightlife) [-16, -10]
  // =========================================================================
  {
    const g = districtGroups.kasumigahama;
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        map: nightWin.map,
        emissive: '#ffffff',
        emissiveMap: nightWin.emissiveMap,
        emissiveIntensity: 1.35,
        roughness: 0.5,
        metalness: 0.2,
      })
    );
    registerEmissive('kasumigahama', mat, 0.2, 1.45, true);

    const rng = mulberry32(1101);
    const bldGeos: THREE.BufferGeometry[] = [];
    const trimGeos: THREE.BufferGeometry[] = [];
    const stripGeos: THREE.BufferGeometry[] = [];

    const specs = [
      { x: -4.2, z: -3.5, w: 2.6, d: 2.8, h: 7.2 },
      { x: -1.0, z: -4.0, w: 2.8, d: 2.6, h: 8.6 },
      { x: 2.4, z: -3.6, w: 2.7, d: 2.8, h: 6.8 },
      { x: 5.0, z: -2.2, w: 2.2, d: 2.4, h: 5.6 },
      { x: -4.6, z: 0.2, w: 2.4, d: 2.5, h: 5.8 },
      { x: -1.6, z: 0.4, w: 2.9, d: 2.4, h: 9.2 },
      { x: 1.8, z: 0.2, w: 2.6, d: 2.5, h: 7.6 },
      { x: 4.8, z: 1.4, w: 2.3, d: 2.6, h: 6.2 },
      { x: -4.0, z: 3.6, w: 2.5, d: 2.3, h: 5.1 },
      { x: -0.6, z: 3.8, w: 2.8, d: 2.4, h: 6.5 },
      { x: 2.6, z: 3.7, w: 2.4, d: 2.3, h: 4.8 },
      { x: -5.5, z: -1.8, w: 1.9, d: 2.0, h: 4.4 },
    ];

    specs.forEach((b, i) => {
      bldGeos.push(makeBox(b.w, b.h, b.d, b.x, b.h / 2 + 0.12, b.z));
      // Roof cap & AC unit
      trimGeos.push(makeBox(b.w + 0.16, 0.24, b.d + 0.16, b.x, b.h + 0.2, b.z));
      trimGeos.push(
        makeBox(0.65, 0.42, 0.55, b.x + (rng() - 0.5) * 0.8, b.h + 0.45, b.z)
      );
      if (i % 2 === 0) {
        // Crown neon accent rim
        stripGeos.push(makeBox(b.w + 0.22, 0.18, b.d + 0.22, b.x, b.h + 0.08, b.z));
      }
    });

    const bMesh = new THREE.Mesh(
      trackGeo(buildBoxBuildingGeometry(bldGeos)),
      [mat, darkRoofCapMat]
    );
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    g.add(bMesh);

    const tMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(trimGeos)), roofTrimMat);
    tMesh.castShadow = true;
    g.add(tMesh);

    const neonStripMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#ff3b7f',
        emissive: '#ff2b78',
        emissiveIntensity: 2.2,
        roughness: 0.2,
      })
    );
    registerEmissive('kasumigahama', neonStripMat, 0.3, 2.2, true);
    g.add(new THREE.Mesh(trackGeo(safeMergeGeometries(stripGeos)), neonStripMat));

    // Iconic Japanese neon signs
    addNeonSign(g, 'kasumigahama', '霞ヶ浜', -1.6, 6.2, 1.85, 0, 1.35, 4.0, '#1e0618', '#ff2d75', '#ff99cc', true, 1.1);
    addNeonSign(g, 'kasumigahama', 'スナック', -4.2, 4.7, -1.8, 0, 1.0, 3.1, '#1a0b05', '#ff9e2c', '#ffe299', true, 2.4);
    addNeonSign(g, 'kasumigahama', 'CLUB', 2.4, 5.2, -1.9, 0.15, 2.4, 0.9, '#081226', '#38e8ff', '#e0faff', false, 3.7);
    addNeonSign(g, 'kasumigahama', '酒', 1.8, 4.6, 1.75, 0, 1.0, 1.8, '#26050c', '#ff2b4a', '#ffdbe2', true, 4.9);
    addNeonSign(g, 'kasumigahama', '24H', -0.6, 4.2, 5.25, 0, 1.9, 0.8, '#0c1824', '#facc15', '#fef08a', false, 6.2);
    addNeonSign(g, 'kasumigahama', '夜桜', 5.0, 3.8, -0.7, Math.PI / 2, 0.95, 2.6, '#1f081e', '#e879f9', '#fae8ff', true, 7.5);

    // Street lamps along Kasumigahama strip
    addStreetLamp(-16 - 5.5, -10 + 5.8);
    addStreetLamp(-16 + 0.5, -10 + 5.8);
    addStreetLamp(-16 + 5.5, -10 + 5.8);
  }

  // =========================================================================
  // DISTRICT 2: SHINTOSHIN (新都心 / Financial Towers) [16, -12]
  // =========================================================================
  {
    const g = districtGroups.shintoshin;
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        map: officeWin.map,
        emissive: '#d8f4ff',
        emissiveMap: officeWin.emissiveMap,
        emissiveIntensity: 1.25,
        roughness: 0.25,
        metalness: 0.55,
      })
    );
    registerEmissive('shintoshin', mat, 0.22, 1.35, true);

    const glassTrimMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#22364d',
        roughness: 0.22,
        metalness: 0.72,
      })
    );
    const finGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#38bdf8',
        emissiveIntensity: 1.9,
        roughness: 0.2,
      })
    );
    registerEmissive('shintoshin', finGlowMat, 0.25, 2.0, true);

    const towers = [
      { x: -3.2, z: -2.5, w: 3.4, d: 3.4, h: 17.5, stepped: true },
      { x: 2.8, z: -2.5, w: 3.4, d: 3.4, h: 19.8, stepped: true }, // Tallest w/ helipad
      { x: -3.8, z: 2.8, w: 3.0, d: 2.8, h: 13.2, stepped: false },
      { x: 2.4, z: 3.0, w: 3.1, d: 3.0, h: 14.8, stepped: true },
      { x: 0.0, z: -5.2, w: 2.8, d: 2.5, h: 11.5, stepped: false },
      { x: -5.4, z: 0.2, w: 2.2, d: 2.2, h: 9.8, stepped: false },
      { x: 5.5, z: 0.6, w: 2.3, d: 2.4, h: 11.0, stepped: false },
    ];

    const towerGeos: THREE.BufferGeometry[] = [];
    const trimGeos: THREE.BufferGeometry[] = [];
    const finGeos: THREE.BufferGeometry[] = [];

    towers.forEach((t, idx) => {
      towerGeos.push(makeBox(t.w, t.h, t.d, t.x, t.h / 2 + 0.12, t.z));
      if (t.stepped) {
        const crownH = 2.1;
        towerGeos.push(
          makeBox(t.w * 0.72, crownH, t.d * 0.72, t.x, t.h + crownH / 2 + 0.12, t.z)
        );
        trimGeos.push(
          makeBox(t.w * 0.76, 0.25, t.d * 0.76, t.x, t.h + crownH + 0.2, t.z)
        );
        // Spire antenna & beacon
        const topY = t.h + crownH + 0.35;
        if (idx === 0 || idx === 1 || idx === 3) {
          trimGeos.push(makeCylinder(0.05, 0.09, 2.6, 6, t.x, topY + 1.3, t.z));
          addBeacon(g, t.x, topY + 2.65, t.z, 'red', idx * 1.1, 0.18);
        }
      } else {
        trimGeos.push(makeBox(t.w + 0.12, 0.25, t.d + 0.12, t.x, t.h + 0.2, t.z));
      }
      // Illuminated vertical corner fin
      finGeos.push(makeBox(0.14, t.h, 0.14, t.x + t.w / 2, t.h / 2 + 0.12, t.z + t.d / 2));
    });

    // Skybridge connecting the twin towers at Y = 11.2
    trimGeos.push(makeBox(3.4, 0.9, 1.4, -0.2, 11.2, -2.5));
    finGeos.push(makeBox(3.4, 0.12, 1.48, -0.2, 10.76, -2.5));
    finGeos.push(makeBox(3.4, 0.12, 1.48, -0.2, 11.65, -2.5));

    const tMesh = new THREE.Mesh(
      trackGeo(buildBoxBuildingGeometry(towerGeos)),
      [mat, glassTrimMat]
    );
    tMesh.castShadow = true;
    tMesh.receiveShadow = true;
    g.add(tMesh);

    const trMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(trimGeos)), glassTrimMat);
    trMesh.castShadow = true;
    g.add(trMesh);

    g.add(new THREE.Mesh(trackGeo(safeMergeGeometries(finGeos)), finGlowMat));

    // Helipad on tallest tower (idx 1)
    const heliMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: helipadTex,
        roughness: 0.7,
      })
    );
    const heliPad = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.2, 2.2)), heliMat);
    heliPad.rotation.x = -Math.PI / 2;
    heliPad.position.set(2.8, 19.8 + 2.1 + 0.36, -2.5);
    g.add(heliPad);

    addNeonSign(g, 'shintoshin', '新都心', 2.8, 18.2, -0.75, 0, 2.8, 0.8, '#071726', '#38bdf8', '#e0f2fe', false, 11.1);
    addNeonSign(g, 'shintoshin', '海湾金融', -3.2, 15.8, -0.75, 0, 2.8, 0.8, '#071726', '#2dd4bf', '#ccfbf1', false, 12.2);

    addStreetLamp(16 - 5.2, -12 + 5.8);
    addStreetLamp(16 + 4.8, -12 + 5.8);
  }

  // =========================================================================
  // DISTRICT 3: KONAN (港南埠頭 / Bay Docks) [18, 14]
  // =========================================================================
  let bargeHandle: { group: THREE.Group; baseY: number };
  {
    const g = districtGroups.konan;

    // Warehouses
    const warehouseMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#3c4856',
        roughness: 0.78,
        metalness: 0.35,
      })
    );
    const roofRustMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#525f6e',
        roughness: 0.7,
        metalness: 0.45,
      })
    );
    const whGeos = [
      makeBox(4.8, 2.2, 3.2, -3.5, 1.22, -2.4),
      makeBox(4.4, 2.0, 2.8, -3.5, 1.12, 2.2),
    ];
    const whMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(whGeos)), warehouseMat);
    whMesh.castShadow = true;
    whMesh.receiveShadow = true;
    g.add(whMesh);

    const whRoofGeos = [
      makeBox(5.1, 0.32, 3.5, -3.5, 2.42, -2.4),
      makeBox(4.7, 0.3, 3.1, -3.5, 2.24, 2.2),
    ];
    g.add(new THREE.Mesh(trackGeo(safeMergeGeometries(whRoofGeos)), roofRustMat));

    // Shipping container stacks (amber, rust, teal)
    const containerMats = [
      trackMat(new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.65, metalness: 0.25 })),
      trackMat(new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.7, metalness: 0.25 })),
      trackMat(new THREE.MeshStandardMaterial({ color: '#0d9488', roughness: 0.65, metalness: 0.25 })),
    ];
    const stackBuckets: THREE.BufferGeometry[][] = [[], [], []];
    const containerLayout = [
      { x: 1.6, z: -2.8, cols: 2, tiers: 3 },
      { x: 4.5, z: -2.8, cols: 2, tiers: 2 },
      { x: 1.8, z: 1.2, cols: 2, tiers: 2 },
      { x: 4.8, z: 1.5, cols: 1, tiers: 3 },
    ];
    const cRng = mulberry32(3030);
    containerLayout.forEach((st) => {
      for (let t = 0; t < st.tiers; t++) {
        for (let c = 0; c < st.cols; c++) {
          const bucket = Math.floor(cRng() * 3);
          stackBuckets[bucket].push(
            makeBox(2.2, 0.82, 0.95, st.x, 0.53 + t * 0.84, st.z + c * 1.1)
          );
        }
      }
    });
    stackBuckets.forEach((bucket, idx) => {
      if (bucket.length > 0) {
        const m = new THREE.Mesh(trackGeo(safeMergeGeometries(bucket)), containerMats[idx]);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      }
    });

    // Two towering red-and-white Harbor Gantry Cranes jutting over the quay
    const craneRedMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#dc2626',
        roughness: 0.52,
        metalness: 0.45,
      })
    );
    const craneWhiteMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.5,
        metalness: 0.35,
      })
    );
    const craneRedGeos: THREE.BufferGeometry[] = [];
    const craneWhiteGeos: THREE.BufferGeometry[] = [];
    for (const cx of [1.2, 6.2]) {
      // 4 legs
      for (const lx of [-0.9, 0.9]) {
        for (const lz of [-0.9, 0.9]) {
          craneRedGeos.push(makeBox(0.24, 6.8, 0.24, cx + lx, 3.5, 6.2 + lz));
        }
      }
      // Crossbeam & horizontal gantry boom extending over water
      craneRedGeos.push(makeBox(2.2, 0.5, 7.6, cx, 6.8, 7.4));
      craneWhiteGeos.push(makeBox(2.0, 0.35, 2.2, cx, 7.1, 6.2));
      // A-frame top & trolley cables
      craneWhiteGeos.push(makeBox(0.3, 2.4, 0.3, cx - 0.8, 8.2, 6.2));
      craneWhiteGeos.push(makeBox(0.3, 2.4, 0.3, cx + 0.8, 8.2, 6.2));
      craneRedGeos.push(makeBox(0.65, 0.4, 0.9, cx, 6.3, 9.6));
      addBeacon(g, cx, 9.5, 6.2, 'red', cx, 0.14);
    }
    const cRed = new THREE.Mesh(trackGeo(safeMergeGeometries(craneRedGeos)), craneRedMat);
    cRed.castShadow = true;
    g.add(cRed);
    const cWhite = new THREE.Mesh(trackGeo(safeMergeGeometries(craneWhiteGeos)), craneWhiteMat);
    cWhite.castShadow = true;
    g.add(cWhite);

    addNeonSign(g, 'konan', '港南埠頭', -3.5, 3.1, -0.75, 0, 2.9, 0.85, '#1c1205', '#f59e0b', '#fef3c7', false, 15.0);

    // Harbor barge moored alongside Konan pier (gently bobs on bay water!)
    const bargeGroup = new THREE.Group();
    bargeGroup.position.set(4.5, -0.35, 11.4);
    const hull = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(6.8, 0.85, 2.5)),
      trackMat(new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.75 }))
    );
    hull.castShadow = true;
    const cabin = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.4, 1.0, 1.8)),
      craneWhiteMat
    );
    cabin.position.set(-2.2, 0.9, 0);
    const cargo = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.1, 0.8, 1.0)),
      containerMats[0]
    );
    cargo.position.set(0.8, 0.8, 0.3);
    bargeGroup.add(hull, cabin, cargo);
    addBeacon(bargeGroup, -2.2, 1.65, 0, 'red', 2.2, 0.11);
    g.add(bargeGroup);
    bargeHandle = { group: bargeGroup, baseY: -0.35 };

    addStreetLamp(18 - 4.8, 14 + 5.5);
    addStreetLamp(18 + 3.0, 14 + 5.5);
  }

  // =========================================================================
  // DISTRICT 4: SAKURADAI (桜台団地 / Residential Estates) [-18, 12]
  // =========================================================================
  {
    const g = districtGroups.sakuradai;
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        map: danchiWin.map,
        emissive: '#ffdca8',
        emissiveMap: danchiWin.emissiveMap,
        emissiveIntensity: 0.95,
        roughness: 0.8,
        metalness: 0.08,
      })
    );
    registerEmissive('sakuradai', mat, 0.14, 1.05, true);

    const concreteBandMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#636e7c',
        roughness: 0.88,
      })
    );

    const danchiSpecs = [
      { x: -3.6, z: -3.8, w: 6.4, d: 2.0, h: 5.2, rotY: 0 },
      { x: 3.4, z: -3.2, w: 5.8, d: 2.0, h: 5.6, rotY: 0.08 },
      { x: -3.2, z: 0.8, w: 6.6, d: 2.0, h: 4.9, rotY: 0 },
      { x: -2.6, z: 4.6, w: 6.2, d: 2.0, h: 5.4, rotY: 0 },
      { x: 4.0, z: 2.2, w: 2.0, d: 5.6, h: 4.8, rotY: 0 },
    ];
    const danchiGeos: THREE.BufferGeometry[] = [];
    const bandGeos: THREE.BufferGeometry[] = [];

    danchiSpecs.forEach((d) => {
      danchiGeos.push(makeBox(d.w, d.h, d.d, d.x, d.h / 2 + 0.12, d.z, d.rotY));
      // Roof cap & stairwell penthouse
      bandGeos.push(makeBox(d.w + 0.18, 0.22, d.d + 0.18, d.x, d.h + 0.2, d.z, d.rotY));
      bandGeos.push(makeBox(1.1, 0.9, d.d + 0.35, d.x, d.h + 0.55, d.z, d.rotY));
    });

    // Local Sakuradai Shopping Arcade roof (桜台商店街) on eastern flank
    bandGeos.push(makeBox(2.2, 1.4, 5.2, 5.8, 0.82, 2.2));
    const arcadeRoofMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#475569',
        emissive: '#fbbf24',
        emissiveIntensity: 0.28,
        roughness: 0.55,
      })
    );
    registerEmissive('sakuradai', arcadeRoofMat, 0.08, 0.35, true);
    g.add(new THREE.Mesh(trackGeo(makeBox(2.45, 0.28, 5.4, 5.8, 1.65, 2.2)), arcadeRoofMat));

    const dMesh = new THREE.Mesh(
      trackGeo(buildBoxBuildingGeometry(danchiGeos)),
      [mat, concreteBandMat]
    );
    dMesh.castShadow = true;
    dMesh.receiveShadow = true;
    g.add(dMesh);

    const bMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(bandGeos)), concreteBandMat);
    bMesh.castShadow = true;
    g.add(bMesh);

    // Stylized cherry blossom & street trees
    const trunkMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#4a3529', roughness: 0.9 })
    );
    const sakuraMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#f4a9c4',
        emissive: '#c06c91',
        emissiveIntensity: 0.18,
        roughness: 0.85,
      })
    );
    const greenTreeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#2d6a4f', roughness: 0.88 })
    );
    const trunkGeos: THREE.BufferGeometry[] = [];
    const sakuraGeos: THREE.BufferGeometry[] = [];
    const greenGeos: THREE.BufferGeometry[] = [];

    const treeSpots = [
      [-6.2, -1.6, true],
      [-0.2, -1.5, true],
      [1.2, -1.5, false],
      [-6.2, 2.8, false],
      [1.2, 2.8, true],
      [2.2, 5.2, true],
      [-6.0, 5.2, true],
      [5.5, -5.0, false],
    ] as const;

    treeSpots.forEach(([tx, tz, isSakura]) => {
      trunkGeos.push(makeCylinder(0.08, 0.12, 0.9, 6, tx, 0.55, tz));
      const crown = new THREE.IcosahedronGeometry(0.62, 1);
      crown.translate(tx, 1.28, tz);
      if (isSakura) sakuraGeos.push(crown);
      else greenGeos.push(crown);
    });

    g.add(new THREE.Mesh(trackGeo(safeMergeGeometries(trunkGeos)), trunkMat));
    const sakMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(sakuraGeos)), sakuraMat);
    sakMesh.castShadow = true;
    g.add(sakMesh);
    const grMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(greenGeos)), greenTreeMat);
    grMesh.castShadow = true;
    g.add(grMesh);

    addNeonSign(g, 'sakuradai', '桜台商店街', 5.8, 2.4, 4.95, 0, 2.3, 0.72, '#1f1629', '#a78bfa', '#ede9fe', false, 21.0);

    addStreetLamp(-18 - 4.5, 12 - 1.5);
    addStreetLamp(-18 + 2.5, 12 + 5.8);
  }

  // =========================================================================
  // DISTRICT 5: KUROKAWA (黒川裏町 / Backstreet Hub) [-2, 16]
  // =========================================================================
  {
    const g = districtGroups.kurokawa;
    const mat = trackMat(
      new THREE.MeshStandardMaterial({
        map: kuroWin.map,
        emissive: '#ffbb66',
        emissiveMap: kuroWin.emissiveMap,
        emissiveIntensity: 1.05,
        roughness: 0.85,
        metalness: 0.1,
      })
    );
    registerEmissive('kurokawa', mat, 0.15, 1.15, true);

    const tileRoofMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#2d333d',
        roughness: 0.82,
        metalness: 0.2,
      })
    );
    const woodPoleMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#38302b',
        roughness: 0.9,
      })
    );
    const vendingMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#e0f7ff',
        emissive: '#38bdf8',
        emissiveIntensity: 1.75,
        roughness: 0.25,
      })
    );
    registerEmissive('kurokawa', vendingMat, 0.35, 1.85, true);

    const kRng = mulberry32(5555);
    const shopGeos: THREE.BufferGeometry[] = [];
    const roofGeos: THREE.BufferGeometry[] = [];

    // Tight patchwork of 16 low-rise machiya & alley shophouses
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const bx = -4.2 + col * 2.75 + (kRng() - 0.5) * 0.35;
        const bz = -3.8 + row * 2.45 + (kRng() - 0.5) * 0.3;
        const bw = 1.65 + kRng() * 0.65;
        const bd = 1.55 + kRng() * 0.6;
        const bh = 1.85 + kRng() * 1.75;
        shopGeos.push(makeBox(bw, bh, bd, bx, bh / 2 + 0.12, bz));
        // Pitched or overhanging tiled roof
        const roof = new THREE.CylinderGeometry(0.12, Math.max(bw, bd) * 0.78, 0.65, 4);
        roof.rotateY(Math.PI / 4);
        roof.translate(bx, bh + 0.42, bz);
        roofGeos.push(roof);
      }
    }

    const sMesh = new THREE.Mesh(
      trackGeo(buildBoxBuildingGeometry(shopGeos)),
      [mat, tileRoofMat]
    );
    sMesh.castShadow = true;
    sMesh.receiveShadow = true;
    g.add(sMesh);

    const rMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(roofGeos)), tileRoofMat);
    rMesh.castShadow = true;
    g.add(rMesh);

    // Vending machines glowing in narrow alleys
    const vendGeos = [
      makeBox(0.38, 0.78, 0.28, -2.8, 0.52, -1.4),
      makeBox(0.38, 0.78, 0.28, 2.5, 0.52, 1.4),
      makeBox(0.38, 0.78, 0.28, -0.4, 0.52, 3.3),
    ];
    g.add(new THREE.Mesh(trackGeo(safeMergeGeometries(vendGeos)), vendingMat));

    // Overhead power poles & sagging catenary power lines
    const poleCoords: [number, number][] = [
      [-5.2, -3.5],
      [0.0, -3.2],
      [5.0, -3.5],
      [-5.0, 2.8],
      [0.2, 2.9],
      [5.2, 2.6],
    ];
    const poleGeos: THREE.BufferGeometry[] = [];
    poleCoords.forEach(([px, pz]) => {
      poleGeos.push(makeCylinder(0.055, 0.08, 4.3, 6, px, 2.25, pz));
      poleGeos.push(makeBox(0.85, 0.07, 0.07, px, 4.1, pz));
    });
    g.add(new THREE.Mesh(trackGeo(safeMergeGeometries(poleGeos)), woodPoleMat));

    const wireMat = trackMat(
      new THREE.LineBasicMaterial({ color: '#1b222c', transparent: true, opacity: 0.72 })
    );
    const wirePairs: [number, number][] = [
      [0, 1],
      [1, 2],
      [3, 4],
      [4, 5],
      [0, 3],
      [1, 4],
      [2, 5],
    ];
    wirePairs.forEach(([a, b]) => {
      const [ax, az] = poleCoords[a];
      const [bx, bz] = poleCoords[b];
      const sagMid = new THREE.Vector3((ax + bx) / 2, 3.65, (az + bz) / 2);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(ax, 4.1, az),
        sagMid,
        new THREE.Vector3(bx, 4.1, bz)
      );
      const lineGeo = trackGeo(new THREE.BufferGeometry().setFromPoints(curve.getPoints(10)));
      g.add(new THREE.Line(lineGeo, wireMat));
    });

    addNeonSign(g, 'kurokawa', '居酒屋', -2.6, 2.6, -2.5, 0, 0.85, 2.1, '#240b05', '#fb7185', '#ffe4e6', true, 31.1);
    addNeonSign(g, 'kurokawa', '質', 1.6, 2.5, 1.5, 0, 0.85, 1.4, '#1b1106', '#f59e0b', '#fef3c7', true, 32.4);
    addNeonSign(g, 'kurokawa', '裏町', -0.2, 2.4, 3.8, 0, 1.6, 0.72, '#140c1c', '#f43f5e', '#fecdd3', false, 33.7);

    addStreetLamp(-2 - 2.8, 16 - 0.5, 1.7);
    addStreetLamp(-2 + 2.8, 16 + 0.5, 1.7);
  }

  // =========================================================================
  // DISTRICT 6: CHUO (中央官庁街 / Civic & T3 Police HQ + Broadcast TV Tower) [0, -2]
  // =========================================================================
  {
    const g = districtGroups.chuo;

    // Monumental stepped civic plaza pad
    const plazaMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#3a4659',
        roughness: 0.78,
        metalness: 0.12,
      })
    );
    const plazaBase = new THREE.Mesh(trackGeo(makeBox(11.5, 0.25, 10.5, 0, 0.24, 0)), plazaMat);
    plazaBase.receiveShadow = true;
    g.add(plazaBase);

    // Civic / T3 Police HQ main building
    const hqMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: civicWin.map,
        emissive: '#cce7ff',
        emissiveMap: civicWin.emissiveMap,
        emissiveIntensity: 1.05,
        roughness: 0.42,
        metalness: 0.35,
      })
    );
    registerEmissive('chuo', hqMat, 0.25, 1.15, false); // Police HQ stays illuminated despite decay!

    const hqGeos = [
      // T3 HQ fortress wing
      makeBox(5.2, 6.2, 3.8, -2.1, 3.4, -1.8),
      // Upper command bridge
      makeBox(3.4, 1.9, 2.6, -2.1, 7.45, -1.8),
      // Ministry annex
      makeBox(3.8, 4.8, 3.2, -3.0, 2.7, 2.8),
      makeBox(3.4, 4.2, 3.0, 3.4, 2.4, 2.8),
    ];
    const hqMesh = new THREE.Mesh(
      trackGeo(buildBoxBuildingGeometry(hqGeos)),
      [hqMat, roofTrimMat]
    );
    hqMesh.castShadow = true;
    hqMesh.receiveShadow = true;
    g.add(hqMesh);

    // Serious architectural concrete rooftop slabs, parapet trim, helipad & sleek patrol beacon strips
    const hqRoofGeos = [
      makeBox(5.38, 0.24, 3.98, -2.1, 6.52, -1.8), // Lower fortress parapet cap
      makeBox(3.56, 0.24, 2.76, -2.1, 8.42, -1.8), // Upper command bridge concrete deck
      makeBox(3.96, 0.22, 3.36, -3.0, 5.12, 2.8),  // Ministry west annex roof slab
      makeBox(3.56, 0.22, 3.16, 3.4, 4.52, 2.8),   // Ministry east annex roof slab
      // Rooftop HVAC & comms penthouse structures on annexes
      makeBox(1.3, 0.48, 1.0, -3.4, 5.45, 2.8),
      makeBox(1.2, 0.44, 0.95, 3.4, 4.82, 2.8),
    ];
    const hqRoofMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(hqRoofGeos)), darkRoofCapMat);
    hqRoofMesh.castShadow = true;
    hqRoofMesh.receiveShadow = true;
    g.add(hqRoofMesh);

    // Dark architectural concrete helipad on Police HQ command bridge
    const hqHeliMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: helipadTex,
        roughness: 0.78,
        metalness: 0.15,
      })
    );
    const hqHelipad = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.3, 2.3)), hqHeliMat);
    hqHelipad.rotation.x = -Math.PI / 2;
    hqHelipad.position.set(-2.1, 8.55, -1.8);
    g.add(hqHelipad);

    // Sleek narrow red/blue rotating patrol beacon strips mounted cleanly on parapet edges
    const policeBlueMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#2563eb',
        emissive: '#3b82f6',
        emissiveIntensity: 2.1,
        roughness: 0.2,
      })
    );
    const policeRedMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#dc2626',
        emissive: '#ef4444',
        emissiveIntensity: 2.1,
        roughness: 0.2,
      })
    );
    const hqBeaconBar = new THREE.Group();
    hqBeaconBar.position.set(-2.1, 8.64, -0.48);
    const beaconHousing = new THREE.Mesh(trackGeo(makeBox(1.42, 0.14, 0.22, 0, -0.02, 0)), darkMetalMat);
    const blueStrip = new THREE.Mesh(trackGeo(makeBox(0.62, 0.1, 0.16, -0.35, 0.04, 0)), policeBlueMat);
    const redStrip = new THREE.Mesh(trackGeo(makeBox(0.62, 0.1, 0.16, 0.35, 0.04, 0)), policeRedMat);
    hqBeaconBar.add(beaconHousing, blueStrip, redStrip);
    g.add(hqBeaconBar);

    const hqBeaconBar2 = new THREE.Group();
    hqBeaconBar2.position.set(-2.1, 8.64, -3.12);
    const beaconHousing2 = new THREE.Mesh(trackGeo(makeBox(1.42, 0.14, 0.22, 0, -0.02, 0)), darkMetalMat);
    const blueStrip2 = new THREE.Mesh(trackGeo(makeBox(0.62, 0.1, 0.16, -0.35, 0.04, 0)), policeBlueMat);
    const redStrip2 = new THREE.Mesh(trackGeo(makeBox(0.62, 0.1, 0.16, 0.35, 0.04, 0)), policeRedMat);
    hqBeaconBar2.add(beaconHousing2, blueStrip2, redStrip2);
    g.add(hqBeaconBar2);

    // Expose beacon bars for smooth rotation in updateDistrictVisuals
    g.userData.hqBeacons = [hqBeaconBar, hqBeaconBar2];

    addNeonSign(g, 'chuo', '海湾警察 T3', -2.1, 6.0, 0.15, 0, 3.2, 0.88, '#08142b', '#3b82f6', '#eff6ff', false, 40.0);

    // T3 Police HQ Rotating Searchlights (2 towers)
    const searchlightOrigins: [number, number, number, number][] = [
      [-3.3, 8.65, -2.4, 0.3],
      [-0.9, 8.65, -1.2, -0.5],
    ];
    searchlightOrigins.forEach(([sx, sy, sz, baseAngle], idx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx, sy, sz);
      g.add(pivot);

      const projector = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 0.45, 8)),
        darkMetalMat
      );
      projector.rotation.x = Math.PI / 3;
      pivot.add(projector);

      // Volumetric-style cone extending along +Z and tilted up
      const coneLen = 28;
      const coneGeo = new THREE.ConeGeometry(4.4, coneLen, 16, 1, true);
      // Shift cone apex to origin and point along -Z/upward
      coneGeo.translate(0, -coneLen / 2, 0);
      coneGeo.rotateX(Math.PI / 2 - 0.34);
      trackGeo(coneGeo);

      const coneMat = trackMat(
        new THREE.MeshBasicMaterial({
          map: beamTex,
          color: '#bfe4ff',
          transparent: true,
          opacity: 0.0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const cone = new THREE.Mesh(coneGeo, coneMat);
      pivot.add(cone);

      const spotGlowMat = trackMat(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: '#cfeaff',
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const spotGlow = new THREE.Sprite(spotGlowMat);
      spotGlow.scale.set(2.4, 2.4, 1);
      pivot.add(spotGlow);

      searchlights.push({
        pivot,
        cone,
        coneMat,
        spotGlow,
        baseAngle,
        speed: idx === 0 ? 0.65 : -0.52,
      });
    });

    // KAIWAN BROADCAST TV TOWER (「海湾TV」 red-and-white lattice tower)
    const tvTowerX = 3.2;
    const tvTowerZ = -1.6;
    const towerRedMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.45, metalness: 0.4 })
    );
    const towerWhiteMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.45, metalness: 0.35 })
    );
    const tvRedGeos: THREE.BufferGeometry[] = [];
    const tvWhiteGeos: THREE.BufferGeometry[] = [];

    // 4 tapered lattice legs + horizontal braces in alternating red/white tiers
    const tiers = 7;
    const totalH = 21.5;
    const tierH = totalH / tiers;
    for (let t = 0; t < tiers; t++) {
      const y0 = 0.36 + t * tierH;
      const y1 = y0 + tierH;
      const r0 = 2.0 * Math.pow(0.68, t);
      const r1 = 2.0 * Math.pow(0.68, t + 1);
      const bucket = t % 2 === 0 ? tvRedGeos : tvWhiteGeos;

      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const p0 = new THREE.Vector3(tvTowerX + dx * r0, y0, tvTowerZ + dz * r0);
        const p1 = new THREE.Vector3(tvTowerX + dx * r1, y1, tvTowerZ + dz * r1);
        const legVec = new THREE.Vector3().subVectors(p1, p0);
        const legLen = legVec.length();
        const legMid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
        const leg = new THREE.CylinderGeometry(0.1, 0.14, legLen, 6);
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          legVec.clone().normalize()
        );
        leg.applyQuaternion(quat);
        leg.translate(legMid.x, legMid.y, legMid.z);
        bucket.push(leg);
      }

      // Horizontal ring beam at top of tier
      const ringW = r1 * 2.05;
      bucket.push(makeBox(ringW, 0.14, 0.14, tvTowerX, y1, tvTowerZ - r1));
      bucket.push(makeBox(ringW, 0.14, 0.14, tvTowerX, y1, tvTowerZ + r1));
      bucket.push(makeBox(0.14, 0.14, ringW, tvTowerX - r1, y1, tvTowerZ));
      bucket.push(makeBox(0.14, 0.14, ringW, tvTowerX + r1, y1, tvTowerZ));
    }

    // Observation deck pods
    tvWhiteGeos.push(makeBox(1.85, 0.72, 1.85, tvTowerX, 11.4, tvTowerZ));
    tvRedGeos.push(makeBox(1.25, 0.58, 1.25, tvTowerX, 16.6, tvTowerZ));
    // Crown antenna mast
    tvWhiteGeos.push(makeCylinder(0.06, 0.16, 4.2, 8, tvTowerX, totalH + 2.3, tvTowerZ));

    const tvRMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(tvRedGeos)), towerRedMat);
    tvRMesh.castShadow = true;
    g.add(tvRMesh);
    const tvWMesh = new THREE.Mesh(trackGeo(safeMergeGeometries(tvWhiteGeos)), towerWhiteMat);
    tvWMesh.castShadow = true;
    g.add(tvWMesh);

    // Observation deck glow ring
    const obsGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#f59e0b',
        emissiveIntensity: 1.8,
      })
    );
    registerEmissive('chuo', obsGlowMat, 0.2, 1.9, false);
    g.add(new THREE.Mesh(trackGeo(makeBox(1.92, 0.25, 1.92, tvTowerX, 11.4, tvTowerZ)), obsGlowMat));

    addNeonSign(g, 'chuo', '海湾TV', tvTowerX, 11.4, tvTowerZ + 1.05, 0, 2.0, 0.72, '#28070c', '#ef4444', '#ffffff', false, 45.2);
    // Crown blinking aviation beacon
    addBeacon(g, tvTowerX, totalH + 4.45, tvTowerZ, 'red', 0.0, 0.24);
    addBeacon(g, -2.1, 8.85, -1.8, 'blue', 1.6, 0.18);

    addStreetLamp(-4.5, 2.2);
    addStreetLamp(4.5, 2.2);
  }

  // Merge all district streetlamps into 2 draw calls
  if (streetLampPoleGeos.length > 0) {
    root.add(new THREE.Mesh(trackGeo(safeMergeGeometries(streetLampPoleGeos)), darkMetalMat));
    root.add(new THREE.Mesh(trackGeo(safeMergeGeometries(streetLampBulbGeos)), streetLampMat));
  }

  // =========================================================================
  // DYNAMIC UPDATE & DISPOSAL (Zero per-frame allocations)
  // =========================================================================
  const whiteColor = new THREE.Color('#ffffff');
  const alertRedColor = new THREE.Color('#ef4444');
  const districtKeys = Object.keys(DISTRICT_CENTERS) as DistrictId[];

  const updateDistrictVisuals = (
    districts: Record<DistrictId, DistrictState>,
    selectedDistrict: DistrictId | null,
    hoveredDistrict: DistrictId | null,
    nightFactor: number,
    time: number
  ) => {
    for (let idx = 0; idx < districtKeys.length; idx++) {
      const dId = districtKeys[idx];
      const d = districts[dId];
      if (!d) continue;

      const decayNorm = THREE.MathUtils.clamp(d.decay / 100, 0, 1);
      const heatNorm = THREE.MathUtils.clamp(d.heat / 100, 0, 1);

      // 1. Update ring glow for selection/hover/heat
      const ringHandle = districtRings[dId];
      const isSelected = selectedDistrict === dId;
      const isHovered = hoveredDistrict === dId;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3.8 + idx);
      if (isSelected) {
        ringHandle.mat.opacity = 0.72 + pulse * 0.24;
        ringHandle.ring.scale.setScalar(1.03 + pulse * 0.02);
        ringHandle.mat.color.copy(ringHandle.baseColor).lerp(whiteColor, 0.25);
      } else if (isHovered) {
        ringHandle.mat.opacity = 0.52 + pulse * 0.14;
        ringHandle.ring.scale.setScalar(1.015);
        ringHandle.mat.color.copy(ringHandle.baseColor);
      } else {
        ringHandle.mat.opacity = 0.16 + heatNorm * 0.18 + nightFactor * 0.12;
        ringHandle.ring.scale.setScalar(1.0);
        ringHandle.mat.color.copy(ringHandle.baseColor);
        if (heatNorm > 0.65) {
          ringHandle.mat.color.lerp(alertRedColor, (heatNorm - 0.65) * 2.0);
        }
      }

      // 2. Dim shopfronts & building emissives as district.decay rises, modulate by nightFactor
      const decayDim = 1.0 - decayNorm * 0.68;
      const emissives = districtEmissiveMaterials[dId];
      for (let eIdx = 0; eIdx < emissives.length; eIdx++) {
        const entry = emissives[eIdx];
        const baseI = THREE.MathUtils.lerp(
          entry.dayIntensity,
          entry.nightIntensity,
          nightFactor
        );
        entry.mat.emissiveIntensity = baseI * (entry.decayAffected ? decayDim : 1.0);
      }

      // 3. Lightweight additive district glow disc & atmospheric halo sprite
      const glow = districtGlows[dId];
      const warmthFactor = 1.0 - decayNorm * 0.45;
      glow.spriteMat.opacity = (0.14 + nightFactor * 0.28 + (isSelected ? 0.14 : 0)) * warmthFactor;
      glow.discMat.opacity = (0.06 + nightFactor * 0.12 + (isSelected ? 0.08 : 0)) * warmthFactor;

      // 4. Reveal decay caution cones, barricades, shutters & blinking warning beacons
      const decayHandle = districtDecayHandles[dId];
      const activeCount =
        d.decay < 12 ? 0 : Math.min(decayHandle.props.length, Math.ceil((d.decay / 100) * decayHandle.props.length));
      for (let pIdx = 0; pIdx < decayHandle.props.length; pIdx++) {
        decayHandle.props[pIdx].visible = pIdx < activeCount;
      }
      const hazardBlink = Math.sin(time * 6.5 + idx * 1.4) > 0 ? 1.0 : 0.2;
      decayHandle.beaconMat.color
        .copy(alertRedColor)
        .multiplyScalar(activeCount > 0 ? hazardBlink * (0.8 + nightFactor * 0.6) : 0);
    }

    // Flicker neon signs gently & dim in daylight/high decay
    for (let sIdx = 0; sIdx < neonSigns.length; sIdx++) {
      const sign = neonSigns[sIdx];
      const d = districts[sign.districtId];
      const decayDim = d ? 1.0 - THREE.MathUtils.clamp(d.decay / 100, 0, 1) * 0.55 : 1.0;
      const flickerWave =
        Math.sin(time * 13.0 + sign.flickerSeed * 7.1) *
        Math.sin(time * 3.7 + sign.flickerSeed);
      const subtleFlicker = flickerWave > 0.92 ? 0.55 : 1.0;
      const brightness = (0.48 + nightFactor * 0.72) * decayDim * subtleFlicker;
      sign.mat.color.copy(sign.baseColor).multiplyScalar(brightness);
    }

    // Streetlamps brightness
    streetLampMat.emissiveIntensity = 0.25 + nightFactor * 2.35;

    // Rotate Police HQ rooftop patrol beacons smoothly
    const hqBeacons = districtGroups.chuo.userData.hqBeacons as THREE.Group[] | undefined;
    if (hqBeacons) {
      const chuoHeat = districts.chuo?.heat ?? 0;
      const rotSpeed = chuoHeat >= 50 ? 5.2 : 2.1;
      for (let i = 0; i < hqBeacons.length; i++) {
        hqBeacons[i].rotation.y = time * rotSpeed + i * Math.PI * 0.5;
      }
    }

    // Gentle barge bobbing
    bargeHandle.group.position.y =
      bargeHandle.baseY + Math.sin(time * 1.35) * 0.06;
    bargeHandle.group.rotation.z = Math.sin(time * 1.1) * 0.018;
  };

  const dispose = () => {
    for (const g of disposables.geometries) g.dispose();
    for (const m of disposables.materials) m.dispose();
    for (const t of disposables.textures) t.dispose();
  };

  return {
    root,
    districtGroups,
    districtHitTargets,
    districtRings,
    districtGlows,
    districtEmissiveMaterials,
    districtDecayHandles,
    searchlights,
    aviationBeacons,
    waterUniforms,
    expresswayCurve,
    bargeHandle,
    neonSigns,
    streetLampMat,
    updateDistrictVisuals,
    dispose,
  };
}
