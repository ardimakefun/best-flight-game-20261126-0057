// Sculpted red-rock canyon terrain, winding river, departure airstrip, mesas, and desert runway.

import { WORLD_BOUNDS } from './config.js';
import { clamp, lerp, smoothstep } from './math3d.js';

// Deterministic 2D hash + smooth value noise for geological rock detail
function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function noise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

export function fbm(x, z) {
  return noise2D(x, z) * 0.62 + noise2D(x * 2.13 + 17.3, z * 2.13 + 9.1) * 0.28 + noise2D(x * 4.4, z * 4.4) * 0.1;
}

// Winding canyon centerline X(z), straight at departure strip and final runway
export function canyonCenterX(z) {
  const departBlend = smoothstep(140, 520, z);
  const runwayBlend = 1 - smoothstep(3900, 4420, z);
  const env = departBlend * runwayBlend;
  const curve = Math.sin(z * 0.0021) * 145 + Math.sin(z * 0.0046 + 1.1) * 58;
  const runwayOffset = 35 * smoothstep(3800, 4450, z);
  return curve * env + runwayOffset;
}

export function canyonCenterDX(z) {
  const eps = 2;
  return (canyonCenterX(z + eps) - canyonCenterX(z - eps)) / (2 * eps);
}

// Winding river channel relative to canyon centerline
export function riverCenterX(z) {
  const cx = canyonCenterX(z);
  // Keep river cleanly clear of departure strip and final desert runway
  const departPush = -62 * (1 - smoothstep(140, 440, z));
  const runwayPush = -78 * smoothstep(4240, 4560, z);
  const meander = Math.sin(z * 0.0092 + 0.5) * 18 + Math.cos(z * 0.0041) * 9;
  const endMask = smoothstep(160, 420, z) * (1 - smoothstep(4260, 4550, z));
  return cx + meander * endMask + departPush + runwayPush;
}

export function riverHalfWidth(z) {
  return 12 + Math.sin(z * 0.007) * 2.5;
}

// Half-width of canyon valley floor at z before walls rise
export function canyonFloorHalfW(z) {
  if (z < 220) return 110;
  if (z > 4250) return lerp(88, 220, smoothstep(4250, 4650, z));
  return 68 + Math.sin(z * 0.0033 + 0.8) * 18 + Math.cos(z * 0.0071) * 8;
}

// Continuous canyon terrain elevation + river channel + flattened airstrips
export function terrainHeight(x, z) {
  const cx = canyonCenterX(z);
  const dx = Math.abs(x - cx);
  const floorHW = canyonFloorHalfW(z);

  // River depression
  const rx = riverCenterX(z);
  const rhw = riverHalfWidth(z);
  const rDist = Math.abs(x - rx);

  // Departure & destination runway flat pads
  const onDepartPad = smoothstep(-240, -170, z) * (1 - smoothstep(140, 240, z));
  const onRunwayPad = smoothstep(4410, 4510, z) * (1 - smoothstep(5140, 5320, z));

  // Base sandy valley floor
  const floorNoise = (fbm(x * 0.015, z * 0.015) - 0.5) * 5;
  let y = WORLD_BOUNDS.departureY + floorNoise * (1 - Math.max(onDepartPad, onRunwayPad));

  // Carve river bed below water surface
  if (rDist < rhw + 14) {
    const bankT = smoothstep(rhw - 2, rhw + 14, rDist);
    const bedY = WORLD_BOUNDS.riverY - 3;
    y = lerp(bedY, y, bankT);
  }

  // Keep takeoff strip and final runway completely flat at y = 12
  if (onDepartPad > 0 && Math.abs(x - cx) < 42) {
    const padFade = 1 - smoothstep(26, 42, Math.abs(x - cx));
    y = lerp(y, WORLD_BOUNDS.departureY, onDepartPad * padFade);
  }
  if (onRunwayPad > 0 && Math.abs(x - cx) < 52) {
    const padFade = 1 - smoothstep(32, 52, Math.abs(x - cx));
    y = lerp(y, WORLD_BOUNDS.runwayY, onRunwayPad * padFade);
  }

  // Canyon walls rising in two realistic geological sandstone steps
  if (dx > floorHW) {
    const wallSpan = dx - floorHW;
    const rockNoise = fbm(x * 0.0085 + 3.1, z * 0.0085);
    const strataNoise = noise2D(x * 0.025, z * 0.025);

    // Lower talus + cliff tier (rises to ~70-95 ft)
    const tier1 = smoothstep(0, 62, wallSpan) * (64 + rockNoise * 26);
    // Sandstone bench plateau followed by upper rim cliff (rises to ~145-195 ft)
    const tier2 = smoothstep(78, 155, wallSpan) * (76 + strataNoise * 38);
    // Outer desert plateau rolling hills & rim ridges
    const outer = smoothstep(160, 420, wallSpan) * (35 * rockNoise + 12);

    // Soften walls around departure & destination basins so vistas feel open at both ends
    const endFlatten = 1 - 0.52 * smoothstep(4300, 4750, z);
    y += (tier1 + tier2 + outer) * endFlatten;
  }

  return y;
}

// Surface type classifier for coloring & physics
export function classifySurface(x, z, y) {
  const cx = canyonCenterX(z);
  if (
    z >= WORLD_BOUNDS.departureZStart &&
    z <= WORLD_BOUNDS.departureZEnd &&
    Math.abs(x - cx) <= 22
  ) {
    return 'airstrip';
  }
  if (
    z >= WORLD_BOUNDS.runwayZStart &&
    z <= WORLD_BOUNDS.runwayZEnd &&
    Math.abs(x - cx) <= WORLD_BOUNDS.runwayHalfWidth
  ) {
    return 'runway';
  }

  const rx = riverCenterX(z);
  const rhw = riverHalfWidth(z);
  if (Math.abs(x - rx) <= rhw && y <= WORLD_BOUNDS.riverY + 0.6) return 'river';
  if (Math.abs(x - rx) <= rhw + 11 && y <= WORLD_BOUNDS.departureY + 2) return 'bank';

  if (y < 24) return 'floor';
  return 'rock';
}

// Precomputed flat-topped red-rock mesas & spires seated into the terrain plateau
export function buildMesas() {
  const mesas = [];
  const rng = (i) => {
    const s = Math.sin(i * 91.345 + 17.7) * 47453.5453;
    return s - Math.floor(s);
  };

  for (let i = 0; i < 42; i += 1) {
    const z = 220 + i * 112 + rng(i * 3) * 40;
    const cx = canyonCenterX(z);
    const hw = canyonFloorHalfW(z);
    const side = i % 2 === 0 ? -1 : 1;
    const lateral = hw + 115 + rng(i * 3 + 1) * 155;
    const x = cx + side * lateral;
    const ground = terrainHeight(x, z);
    const baseY = Math.min(ground, 72) - 44;
    const radiusTop = 28 + rng(i * 3 + 2) * 40;
    const radiusBot = radiusTop * (1.35 + rng(i * 5) * 0.3);
    const height = 104 + rng(i * 7) * 82;
    mesas.push({ x, baseY, z, radiusTop, radiusBot, height, sides: 6 });
  }
  return mesas;
}

// Sparse desert boulders, saguaro silhouettes, and riverbank vegetation props
export function buildSceneryProps() {
  const props = [];
  const rng = (i) => {
    const s = Math.sin(i * 43.17 + 5.9) * 28941.123;
    return s - Math.floor(s);
  };

  for (let i = 0; i < 150; i += 1) {
    const z = -120 + i * 35 + rng(i * 2) * 18;
    const rx = riverCenterX(z);
    const rhw = riverHalfWidth(z);
    const cx = canyonCenterX(z);
    const side = i % 2 === 0 ? -1 : 1;

    // Place river scrub near riverbanks away from runways
    const nearRunway =
      (z > -200 && z < 160 && Math.abs(rx - cx) < 35) ||
      (z > 4480 && z < 5180 && Math.abs(rx - cx) < 40);

    if (!nearRunway && i % 2 === 0) {
      const px = rx + side * (rhw + 6 + rng(i * 5 + 1) * 18);
      const py = terrainHeight(px, z);
      if (py < 24) {
        props.push({ kind: 'scrub', x: px, y: py, z, scale: 2.8 + rng(i * 7) * 2.5 });
      }
    } else {
      const hw = canyonFloorHalfW(z);
      const px = cx + side * (hw - 8 + rng(i * 11) * 22);
      const py = terrainHeight(px, z);
      const kind = i % 3 === 0 ? 'cactus' : 'rock';
      if (Math.abs(px - cx) > 34) {
        props.push({ kind, x: px, y: py, z, scale: 3.5 + rng(i * 13) * 4.0 });
      }
    }
  }
  return props;
}

// Iconic natural red-rock sandstone arches spanning high over canyon bends
export function buildArches() {
  const specs = [
    { z: 1835, spanMul: 1.05, clearY: 96, thick: 22 },
    { z: 2760, spanMul: 1.08, clearY: 104, thick: 24 },
  ];
  return specs.map((sp) => {
    const cx = canyonCenterX(sp.z);
    const hw = canyonFloorHalfW(sp.z) * sp.spanMul;
    return {
      x: cx,
      z: sp.z,
      halfSpan: hw + 18,
      clearY: sp.clearY,
      thick: sp.thick,
      depth: 26,
    };
  });
}
