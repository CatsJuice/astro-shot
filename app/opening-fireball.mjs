export function createOpeningFireballCue(random = Math.random) {
  return {
    delay: 0.38 + random() * 0.34,
    angleDegrees: 25 + random() * 14,
    originX: 0.3 + random() * 0.12,
    originY: 0.26 + random() * 0.12,
    variant: random() < 0.28 ? "strong" : null,
  };
}
