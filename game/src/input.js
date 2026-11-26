// Keyboard and mouse input controller with single-press action flags and camera drag look.

export const ACTION_START = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_CAMERA = 8;
export const ACTION_INVERT = 16;
export const ACTION_MUTE = 32;

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let missionSelect = -1;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let movedDrag = false;
  let lookDx = 0;
  let lookDy = 0;
  let wheelDelta = 0;
  let lastClick = null;

  window.addEventListener('keydown', (e) => {
    const code = e.code;
    if (!e.repeat) {
      if (code === 'Space' || code === 'Enter') actions |= ACTION_START;
      if (code === 'KeyP') actions |= ACTION_PAUSE;
      if (code === 'KeyR') actions |= ACTION_RESTART;
      if (code === 'KeyC') actions |= ACTION_CAMERA;
      if (code === 'KeyI') actions |= ACTION_INVERT;
      if (code === 'KeyM') actions |= ACTION_MUTE;
      if (code === 'Digit1') missionSelect = 0;
      if (code === 'Digit2') missionSelect = 1;
      if (code === 'Digit3') missionSelect = 2;
    }
    held.add(code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
  });

  window.addEventListener('blur', () => {
    held.clear();
    dragging = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    movedDrag = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    lookDx += e.movementX;
    lookDy += e.movementY;
    if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 6) {
      movedDrag = true;
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (dragging && !movedDrag) {
      lastClick = { clientX: e.clientX, clientY: e.clientY };
      actions |= ACTION_START;
    }
    dragging = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener(
    'wheel',
    (e) => {
      wheelDelta += e.deltaY;
      e.preventDefault();
    },
    { passive: false },
  );

  function readFlightControls() {
    const pitchUp = held.has('KeyW') || held.has('ArrowUp');
    const pitchDown = held.has('KeyS') || held.has('ArrowDown');
    const rollRight = held.has('KeyD') || held.has('ArrowRight');
    const rollLeft = held.has('KeyA') || held.has('ArrowLeft');
    const thrUp = held.has('KeyE') || held.has('ShiftLeft') || held.has('ShiftRight');
    const thrDown = held.has('KeyQ') || held.has('ControlLeft');

    return {
      pitch: (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0),
      roll: (rollRight ? 1 : 0) - (rollLeft ? 1 : 0),
      throttle: (thrUp ? 1 : 0) - (thrDown ? 1 : 0),
    };
  }

  function takeActions() {
    const out = actions;
    actions = 0;
    return out;
  }

  function takeMissionSelect() {
    const m = missionSelect;
    missionSelect = -1;
    return m;
  }

  function consumeLookDelta() {
    const d = { dx: lookDx, dy: lookDy };
    lookDx = 0;
    lookDy = 0;
    return d;
  }

  function consumeWheelDelta() {
    const w = wheelDelta;
    wheelDelta = 0;
    return w;
  }

  function consumeClick() {
    const c = lastClick;
    lastClick = null;
    return c;
  }

  return {
    readFlightControls,
    takeActions,
    takeMissionSelect,
    consumeLookDelta,
    consumeWheelDelta,
    consumeClick,
    isDragging: () => dragging,
  };
}
