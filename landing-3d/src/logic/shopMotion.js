export const SPIN_MS = 920;
const TAU = Math.PI * 2;
export function spinAt(change, now) {
  const p = Math.min(1, Math.max(0, (now - change.start) / SPIN_MS));
  const eased = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
  return {
    index: p < 0.5 ? change.from : change.to,
    yaw: change.yaw + TAU * eased,
    lift: Math.sin(Math.PI * p) * 0.014,
    scale: 1 - Math.sin(Math.PI * p) * 0.045,
    active: p < 1,
  };
}

// Cada selección nueva parte del producto y ángulo que ya se están mostrando.
export function createShopMotion(initial = 0) {
  let selected = initial, shown = initial, yaw = 0.15, pitch = 0, change = null;
  function at(now) {
    if (!change) return { index: shown, yaw, pitch, lift: 0, scale: 1, active: false };
    const pose = spinAt(change, now);
    shown = pose.index; yaw = pose.yaw;
    if (!pose.active) { change = null; yaw %= TAU; }
    return { ...pose, yaw, pitch };
  }
  return {
    at,
    select(index, now, animate = true) {
      if (index === selected) return;
      const current = at(now);
      selected = index;
      if (!animate) { shown = index; change = null; return; }
      change = { from: current.index, to: index, yaw: current.yaw, start: now };
    },
    rotate(dx, dy) {
      shown = selected; change = null;
      yaw += dx; pitch = Math.min(0.5, Math.max(-0.5, pitch + dy));
    },
    reset() { yaw = 0.15; pitch = 0; shown = selected; change = null; },
  };
}
