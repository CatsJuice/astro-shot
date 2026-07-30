export function pointerDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function pinchRatio(startDistance, currentDistance) {
  if (
    !Number.isFinite(startDistance) ||
    !Number.isFinite(currentDistance) ||
    startDistance <= 0 ||
    currentDistance <= 0
  ) {
    return 1;
  }
  return currentDistance / startDistance;
}
