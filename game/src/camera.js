// Smooth spring-damped chase camera and cockpit camera with optional mouse look.

import { VIEW } from './config.js';
import { buildBasis, clamp, lerp } from './math3d.js';
import { terrainHeight } from './terrain.js';

export function createCamera() {
  return {
    pos: { x: 0, y: 24, z: -155 },
    yaw: 0,
    pitch: -0.04,
    roll: 0,
    fov: VIEW.fov,
    chaseZoom: 1,
    mouseYaw: 0,
    mousePitch: 0,
    basis: buildBasis(0, 0, 0),
  };
}

export function updateCamera(cam, state, input, dt) {
  const p = state.plane;

  // Optional mouse orbit offset (drag mouse to inspect canyon/aircraft, relaxes back smoothly)
  const drag = input.consumeLookDelta();
  if (input.isDragging()) {
    cam.mouseYaw = clamp(cam.mouseYaw + drag.dx * 0.0045, -1.2, 1.2);
    cam.mousePitch = clamp(cam.mousePitch + drag.dy * 0.0035, -0.45, 0.45);
  } else {
    cam.mouseYaw = lerp(cam.mouseYaw, 0, clamp(3.2 * dt, 0, 1));
    cam.mousePitch = lerp(cam.mousePitch, 0, clamp(3.2 * dt, 0, 1));
  }

  const wheel = input.consumeWheelDelta ? input.consumeWheelDelta() : 0;
  if (wheel !== 0) {
    cam.chaseZoom = clamp(cam.chaseZoom + wheel * 0.001, 0.65, 1.3);
  }

  if (state.camMode === 'cockpit') {
    const pBasis = buildBasis(p.yaw, p.pitch, p.roll);
    cam.pos.x = p.pos.x + pBasis.up.x * 1.65 + pBasis.fwd.x * 2.1;
    cam.pos.y = p.pos.y + pBasis.up.y * 1.65 + pBasis.fwd.y * 2.1;
    cam.pos.z = p.pos.z + pBasis.up.z * 1.65 + pBasis.fwd.z * 2.1;
    cam.yaw = p.yaw + cam.mouseYaw;
    cam.pitch = p.pitch - cam.mousePitch;
    cam.roll = p.roll * 0.72;
    cam.fov = lerp(cam.fov, VIEW.fov * 0.94, 4 * dt);
  } else {
    // Classic chase camera behind and slightly above patrol plane (zoomable via mouse wheel)
    const lookYaw = p.yaw + cam.mouseYaw;
    const zoom = cam.chaseZoom ?? 1;
    const closeT = clamp((1 - zoom) / 0.35, 0, 1);
    const behind = 29 * zoom;
    const above = lerp(7.4, 4.3, closeT);
    const aimOff = lerp(2.2, -0.5, closeT);

    const targetX = p.pos.x - Math.sin(lookYaw) * behind;
    const targetZ = p.pos.z - Math.cos(lookYaw) * behind;
    const desiredY = p.pos.y + above - Math.sin(p.pitch) * 6 + cam.mousePitch * 16;
    const groundClearance = terrainHeight(targetX, targetZ) + 4.2;
    const targetY = Math.max(desiredY, groundClearance);

    const jumpDist = Math.hypot(targetX - cam.pos.x, targetY - cam.pos.y, targetZ - cam.pos.z);
    const k = jumpDist > 110 ? 1 : clamp(8.5 * dt, 0, 1);
    cam.pos.x = lerp(cam.pos.x, targetX, k);
    cam.pos.y = lerp(cam.pos.y, targetY, k);
    cam.pos.z = lerp(cam.pos.z, targetZ, k);

    // Look slightly ahead of the plane so target rings & canyon horizon stay framed cleanly
    const aimX = p.pos.x + Math.sin(p.yaw) * 42;
    const aimY = p.pos.y + Math.sin(p.pitch) * 20 + aimOff;
    const aimZ = p.pos.z + Math.cos(p.yaw) * 42;

    const dx = aimX - cam.pos.x;
    const dy = aimY - cam.pos.y;
    const dz = aimZ - cam.pos.z;
    const horiz = Math.hypot(dx, dz) || 1;

    cam.yaw = Math.atan2(dx, dz);
    cam.pitch = lerp(cam.pitch, Math.atan2(dy, horiz), clamp(9 * dt, 0, 1));
    cam.roll = lerp(cam.roll, p.roll * 0.24, clamp(7 * dt, 0, 1));

    // Subtle speed FOV stretch
    const targetFov = VIEW.fov - clamp((p.speed - 45) * 1.4, 0, 65);
    cam.fov = lerp(cam.fov, targetFov, 4 * dt);
  }

  if (state.cameraShake > 0) {
    cam.pos.x += (Math.random() - 0.5) * state.cameraShake * 2.5;
    cam.pos.y += (Math.random() - 0.5) * state.cameraShake * 2.5;
  }

  cam.basis = buildBasis(cam.yaw, cam.pitch, cam.roll);
}
