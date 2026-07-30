/**
 * @typedef {{
 *   left: number;
 *   top: number;
 *   width: number;
 *   height: number;
 * }} Rectangle
 */

/**
 * @typedef {{
 *   x: number;
 *   y: number;
 *   width: number;
 *   height: number;
 * }} ScissorBounds
 */

/**
 * @param {readonly (Rectangle | null | undefined)[]} rectangles
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} deviceScale
 * @param {number} margin
 * @returns {ScissorBounds | null}
 */
export function computeGlassScissorBounds(
  rectangles,
  canvasWidth,
  canvasHeight,
  deviceScale,
  margin,
) {
  let boundsLeft = Number.POSITIVE_INFINITY;
  let boundsTop = Number.POSITIVE_INFINITY;
  let boundsRight = Number.NEGATIVE_INFINITY;
  let boundsBottom = Number.NEGATIVE_INFINITY;

  for (const rectangle of rectangles) {
    if (
      !rectangle ||
      !Number.isFinite(rectangle.left) ||
      !Number.isFinite(rectangle.top) ||
      !Number.isFinite(rectangle.width) ||
      !Number.isFinite(rectangle.height) ||
      rectangle.width <= 0 ||
      rectangle.height <= 0
    ) {
      continue;
    }
    boundsLeft = Math.min(boundsLeft, rectangle.left);
    boundsTop = Math.min(boundsTop, rectangle.top);
    boundsRight = Math.max(boundsRight, rectangle.left + rectangle.width);
    boundsBottom = Math.max(boundsBottom, rectangle.top + rectangle.height);
  }

  if (!Number.isFinite(boundsLeft)) return null;

  const left = Math.max(
    0,
    Math.floor((boundsLeft - margin) * deviceScale),
  );
  const top = Math.max(
    0,
    Math.floor((boundsTop - margin) * deviceScale),
  );
  const right = Math.min(
    canvasWidth,
    Math.ceil((boundsRight + margin) * deviceScale),
  );
  const bottom = Math.min(
    canvasHeight,
    Math.ceil((boundsBottom + margin) * deviceScale),
  );
  if (right <= left || bottom <= top) return null;

  return {
    x: left,
    y: canvasHeight - bottom,
    width: right - left,
    height: bottom - top,
  };
}
