/**
 * @typedef {{
 *   equatorialX: number;
 *   equatorialY: number;
 *   equatorialZ: number;
 * }} EquatorialCoordinates
 */

/**
 * @typedef {{
 *   forward: readonly number[];
 *   right: readonly number[];
 *   up: readonly number[];
 * }} ProjectionBasis
 */

/**
 * @typedef {{
 *   x: number;
 *   y: number;
 *   altitude: number;
 *   depth: number;
 * }} ProjectedCelestial
 */

/**
 * @typedef {{ magnitude: number }} MagnitudeEntry
 */

/**
 * @typedef {{ x: number; y: number }} SensorNoiseCrop
 */

export function seeded(index) {
  const value = Math.sin(index * 91.171 + 17.371) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * @param {EquatorialCoordinates} output
 * @param {number} rightAscension
 * @param {number} declination
 */
export function setEquatorialCoordinates(
  output,
  rightAscension,
  declination,
) {
  const cosDeclination = Math.cos(declination);
  output.equatorialX = cosDeclination * Math.cos(rightAscension);
  output.equatorialY = cosDeclination * Math.sin(rightAscension);
  output.equatorialZ = Math.sin(declination);
}

/**
 * @param {readonly MagnitudeEntry[]} stars
 * @param {number} visibleMagnitude
 */
export function firstStarAtOrBelowMagnitude(stars, visibleMagnitude) {
  let lower = 0;
  let upper = stars.length;
  while (lower < upper) {
    const middle = (lower + upper) >>> 1;
    if (stars[middle].magnitude > visibleMagnitude) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  return lower;
}

/**
 * @param {EquatorialCoordinates} star
 * @param {number} sinSidereal
 * @param {number} cosSidereal
 * @param {number} sinLatitude
 * @param {number} cosLatitude
 * @param {ProjectionBasis} basis
 * @param {number} focal
 * @param {number} width
 * @param {number} height
 * @param {ProjectedCelestial} output
 */
export function projectCelestial(
  star,
  sinSidereal,
  cosSidereal,
  sinLatitude,
  cosLatitude,
  basis,
  focal,
  width,
  height,
  output,
) {
  const hourCosine =
    star.equatorialX * cosSidereal + star.equatorialY * sinSidereal;
  const localX =
    star.equatorialY * cosSidereal - star.equatorialX * sinSidereal;
  const localY =
    star.equatorialZ * cosLatitude - hourCosine * sinLatitude;
  const localZ =
    star.equatorialZ * sinLatitude + hourCosine * cosLatitude;
  const cameraX =
    localX * basis.right[0] +
    localY * basis.right[1] +
    localZ * basis.right[2];
  const cameraY =
    localX * basis.up[0] +
    localY * basis.up[1] +
    localZ * basis.up[2];
  const cameraZ =
    localX * basis.forward[0] +
    localY * basis.forward[1] +
    localZ * basis.forward[2];
  if (cameraZ <= 0.08) return false;
  output.x = width * 0.5 + (cameraX / cameraZ) * focal;
  output.y = height * 0.5 - (cameraY / cameraZ) * focal;
  output.altitude = localZ;
  output.depth = cameraZ;
  return true;
}

/**
 * @param {SensorNoiseCrop} output
 * @param {number} noiseFrame
 * @param {number} sampleWidth
 * @param {number} sampleHeight
 */
export function setSensorNoiseCrop(
  output,
  noiseFrame,
  sampleWidth,
  sampleHeight,
) {
  const noiseSample = Math.floor((noiseFrame - 1) / 5);
  output.x = Math.floor(seeded(noiseSample + 8201) * sampleWidth);
  output.y = Math.floor(seeded(noiseSample + 15401) * sampleHeight);
}
