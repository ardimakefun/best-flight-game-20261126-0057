// Keyboard and mouse, read fresh every frame. Arrow keys / WASD fly the plane,
// Shift / Ctrl (or +/-) work the throttle, R restarts, P pauses, Space or a
// click confirms. The mouse steers too: hold the pointer left or right of
// centre to bank, above or below centre to pitch.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseActive = false;
  let mouseDown = false;

  function codeOf(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(codeOf(event));
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(codeOf(event));
  });
  window.addEventListener('blur', () => {
    keys.clear();
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width - 0.5;
    mouseY = (event.clientY - rect.top) / rect.height - 0.5;
    mouseActive = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width - 0.5;
    mouseY = (event.clientY - rect.top) / rect.height - 0.5;
    mouseActive = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function axis(neg, pos) {
    return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  }

  return {
    /** -1 (left) .. 1 (right) bank command, keys win over the mouse. */
    roll() {
      const key = axis('ArrowLeft', 'ArrowRight') || axis('KeyA', 'KeyD');
      if (key !== 0) return key;
      if (mouseActive && mouseDown) return Math.max(-1, Math.min(1, mouseX * 3));
      return 0;
    },
    /** -1 (climb) .. 1 (descend) pitch command, keys win over the mouse. */
    pitch() {
      const key = axis('ArrowUp', 'ArrowDown') || axis('KeyW', 'KeyS');
      if (key !== 0) return key;
      if (mouseActive && mouseDown) return Math.max(-1, Math.min(1, mouseY * 3));
      return 0;
    },
    /** -1 .. 1 throttle command. */
    throttle() {
      let value = 0;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal')) value += 1;
      if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('Minus')) value -= 1;
      return value;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
