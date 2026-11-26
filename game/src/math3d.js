// 3D vector math, orthonormal basis construction, near-plane polygon clipping, and projection.

import { VIEW } from './config.js';

export function v3(x, y, z) {
  return { x, y, z };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function len(a) {
  return Math.hypot(a.x, a.y, a.z);
}

export function norm(a) {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Build orthonormal right/up/fwd basis from yaw, pitch, roll (+Z fwd, +X right, +Y up)
export function buildBasis(yaw, pitch, roll) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  const fwd = { x: sy * cp, y: sp, z: cy * cp };
  const worldUp = { x: 0, y: 1, z: 0 };
  const right0 = norm(cross(worldUp, fwd));
  const up0 = cross(fwd, right0);

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const right = {
    x: right0.x * cr - up0.x * sr,
    y: right0.y * cr - up0.y * sr,
    z: right0.z * cr - up0.z * sr,
  };
  const up = {
    x: right0.x * sr + up0.x * cr,
    y: right0.y * sr + up0.y * cr,
    z: right0.z * sr + up0.z * cr,
  };
  return { right, up, fwd };
}

export function worldToCam(p, cam) {
  const rx = p.x - cam.pos.x;
  const ry = p.y - cam.pos.y;
  const rz = p.z - cam.pos.z;
  const b = cam.basis;
  return {
    x: rx * b.right.x + ry * b.right.y + rz * b.right.z,
    y: rx * b.up.x + ry * b.up.y + rz * b.up.z,
    z: rx * b.fwd.x + ry * b.fwd.y + rz * b.fwd.z,
  };
}

export function projectCamPoint(cp, fov = VIEW.fov) {
  if (cp.z < VIEW.nearZ) return null;
  const inv = fov / cp.z;
  return {
    x: VIEW.width * 0.5 + cp.x * inv,
    y: VIEW.height * 0.5 - cp.y * inv,
    z: cp.z,
  };
}

export function projectWorld(p, cam) {
  return projectCamPoint(worldToCam(p, cam), cam.fov);
}

// Clip a polygon in camera space against z >= nearZ (Sutherland-Hodgman) and project to 2D
export function clipAndProjectPoly(worldPts, cam, nearZ = VIEW.nearZ) {
  const camPts = new Array(worldPts.length);
  let anyIn = false;
  for (let i = 0; i < worldPts.length; i += 1) {
    const cp = worldToCam(worldPts[i], cam);
    camPts[i] = cp;
    if (cp.z >= nearZ) anyIn = true;
  }
  if (!anyIn) return null;

  const clipped = [];
  const n = camPts.length;
  for (let i = 0; i < n; i += 1) {
    const a = camPts[i];
    const b = camPts[(i + 1) % n];
    const aIn = a.z >= nearZ;
    const bIn = b.z >= nearZ;

    if (aIn && bIn) {
      clipped.push(b);
    } else if (aIn && !bIn) {
      const t = (nearZ - a.z) / (b.z - a.z);
      clipped.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: nearZ,
      });
    } else if (!aIn && bIn) {
      const t = (nearZ - a.z) / (b.z - a.z);
      clipped.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: nearZ,
      });
      clipped.push(b);
    }
  }

  if (clipped.length < 3) return null;

  const fov = cam.fov;
  const hw = VIEW.width * 0.5;
  const hh = VIEW.height * 0.5;
  const screen = new Array(clipped.length);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let depthSum = 0;

  for (let i = 0; i < clipped.length; i += 1) {
    const c = clipped[i];
    const inv = fov / c.z;
    const sx = hw + c.x * inv;
    const sy = hh - c.y * inv;
    screen[i] = { x: sx, y: sy };
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
    depthSum += c.z;
  }

  // Frustum screen bounds rejection
  if (maxX < -60 || minX > VIEW.width + 60 || maxY < -60 || minY > VIEW.height + 60) {
    return null;
  }

  return { pts: screen, depth: depthSum / clipped.length };
}
