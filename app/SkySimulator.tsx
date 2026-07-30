"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type CSSProperties,
  type SetStateAction,
} from "react";
import { LiquidGlassMenu } from "./LiquidGlassMenu";

type CatalogRow = [
  rightAscension: number,
  declination: number,
  magnitude: number,
  colorIndex: number | null,
  name: string | null,
];

type Catalog = {
  count: number;
  stars: CatalogRow[];
};

type RenderStar = {
  ra: number;
  sinDec: number;
  cosDec: number;
  magnitude: number;
  color: [number, number, number];
  phase: number;
  frequency: number;
  name: string | null;
};

type Settings = {
  rotationSpeed: number;
  latitude: number;
  starExposure: number;
  twinkle: number;
  skyBrightness: number;
  skyHue: number;
  skySaturation: number;
  noiseEnabled: boolean;
  sensorNoise: number;
  meteorRate: number;
  meteorSpeed: number;
  ordinaryWeight: number;
  fireballWeight: number;
  fireballEnergy: number;
  ignitionTime: number;
  burstChance: number;
  burstPosition: number;
  tailLength: number;
  afterglow: number;
  meteorAngle: number;
  directionSpread: number;
  paused: boolean;
};

type View = {
  azimuth: number;
  altitude: number;
  fov: number;
};

type MeteorVariant = "weak" | "strong" | null;
type MeteorSummon = "ordinary" | "fireball" | "weak-fireball" | "strong-fireball";
type Vector3 = [number, number, number];

type TrailPoint = {
  x: number;
  y: number;
  direction: Vector3;
  born: number;
  energy: number;
};

type Meteor = {
  kind: "ordinary" | "fireball";
  variant: MeteorVariant;
  strength: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  curve: number;
  direction: Vector3;
  angularVelocity: Vector3;
  angularAcceleration: Vector3;
  born: number;
  duration: number;
  trailLife: number;
  bodyTime: number;
  attackTime: number;
  alive: boolean;
  lastSample: number;
  flareAt: number;
  secondFlareAt: number;
  flareWidth: number;
  flareStrength: number;
  seed: number;
  points: TrailPoint[];
};

type GalacticPanoramaRenderer = {
  canvas: HTMLCanvasElement;
  render: (
    width: number,
    height: number,
    basis: ReturnType<typeof basisForView>,
    fieldOfView: number,
    latitude: number,
    sidereal: number,
    intensity: number,
  ) => boolean;
  dispose: () => void;
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const SIDEREAL_RATE = TAU / 86164.0905;

const DEFAULT_SETTINGS: Settings = {
  rotationSpeed: 120,
  latitude: 1.35,
  starExposure: 3.2,
  twinkle: 0.76,
  skyBrightness: 0.67,
  skyHue: 218,
  skySaturation: 0.4,
  noiseEnabled: true,
  sensorNoise: 0.28,
  meteorRate: 7,
  meteorSpeed: 1,
  ordinaryWeight: 74,
  fireballWeight: 26,
  fireballEnergy: 0.72,
  ignitionTime: 0.12,
  burstChance: 0.68,
  burstPosition: 0.52,
  tailLength: 1,
  afterglow: 0.55,
  meteorAngle: 11,
  directionSpread: 118,
  paused: false,
};

const DEFAULT_VIEW: View = {
  azimuth: 202 * DEG,
  altitude: 28 * DEG,
  fov: 59 * DEG,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function seeded(index: number) {
  const value = Math.sin(index * 91.171 + 17.371) * 43758.5453;
  return value - Math.floor(value);
}

function temporalNoise(time: number, seed: number) {
  const integer = Math.floor(time);
  const fraction = time - integer;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const first = seeded(integer * 1.917 + seed * 13.71);
  const second = seeded((integer + 1) * 1.917 + seed * 13.71);
  return (first + (second - first) * eased) * 2 - 1;
}

function createRandom(seed = 74291) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function gaussian(random: () => number) {
  const first = Math.max(1e-7, random());
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(TAU * random());
}

function colorFromBv(bv: number | null): [number, number, number] {
  if (bv === null || !Number.isFinite(bv)) return [235, 242, 255];
  const value = clamp(bv, -0.4, 2);
  let red: number;
  let green: number;
  let blue: number;

  if (value < 0) {
    red = 0.61 + 0.11 * value + 0.1 * value * value;
  } else if (value < 0.4) {
    red = 0.83 + 0.17 * (value / 0.4);
  } else {
    red = 1;
  }

  if (value < 0) {
    green = 0.7 + 0.07 * value + 0.1 * value * value;
  } else if (value < 0.4) {
    green = 0.87 + 0.11 * (value / 0.4);
  } else if (value < 1.6) {
    green = 0.98 - 0.16 * ((value - 0.4) / 1.2);
  } else {
    green = 0.82 - 0.5 * (value - 1.6);
  }

  if (value < 0.4) {
    blue = 1;
  } else if (value < 1.5) {
    blue = 1 - 0.47 * ((value - 0.4) / 1.1);
  } else {
    blue = 0.63 - 0.6 * (value - 1.5);
  }

  return [
    Math.round(clamp(red, 0, 1) * 255),
    Math.round(clamp(green, 0, 1) * 255),
    Math.round(clamp(blue, 0, 1) * 255),
  ];
}

function currentSiderealAngle(longitudeDegrees = 103.82) {
  const julianDate = Date.now() / 86400000 + 2440587.5;
  const degrees =
    280.46061837 +
    360.98564736629 * (julianDate - 2451545) +
    longitudeDegrees;
  return ((degrees % 360) + 360) % 360 * DEG;
}

function createGalacticPanoramaRenderer(): GalacticPanoramaRenderer | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;

    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision highp float;

    varying vec2 v_uv;
    uniform sampler2D u_panorama;
    uniform vec2 u_resolution;
    uniform float u_tan_half_fov;
    uniform mat3 u_camera_to_local;
    uniform float u_latitude;
    uniform float u_sidereal;
    uniform float u_intensity;

    const float PI = 3.141592653589793;
    const float TAU = 6.283185307179586;

    void main() {
      float aspect = u_resolution.x / u_resolution.y;
      vec2 screen = vec2(
        (v_uv.x * 2.0 - 1.0) * aspect,
        v_uv.y * 2.0 - 1.0
      );
      vec3 camera_ray = normalize(vec3(
        screen.x * u_tan_half_fov,
        screen.y * u_tan_half_fov,
        1.0
      ));
      vec3 local = normalize(u_camera_to_local * camera_ray);

      float sin_latitude = sin(u_latitude);
      float cos_latitude = cos(u_latitude);
      float qx = local.z * cos_latitude - local.y * sin_latitude;
      float qy = -local.x;
      float qz = local.y * cos_latitude + local.z * sin_latitude;
      float sin_sidereal = sin(u_sidereal);
      float cos_sidereal = cos(u_sidereal);
      vec3 equatorial = vec3(
        qx * cos_sidereal + qy * sin_sidereal,
        qx * sin_sidereal - qy * cos_sidereal,
        qz
      );

      vec3 galactic = normalize(vec3(
        -0.0548755604 * equatorial.x -
          0.8734370902 * equatorial.y -
          0.4838350155 * equatorial.z,
        0.4941094279 * equatorial.x -
          0.4448296300 * equatorial.y +
          0.7469822445 * equatorial.z,
        -0.8676661490 * equatorial.x -
          0.1980763734 * equatorial.y +
          0.4559837762 * equatorial.z
      ));

      float longitude = atan(galactic.y, galactic.x);
      float galactic_latitude =
        asin(clamp(galactic.z, -1.0, 1.0));
      float longitude_uv = fract(longitude / TAU + 0.5);
      float latitude_uv = 0.5 + galactic_latitude / PI;
      vec3 panorama = texture2D(
        u_panorama,
        vec2(longitude_uv, latitude_uv)
      ).rgb;
      float luminance = dot(panorama, vec3(0.2126, 0.7152, 0.0722));
      float center_distance = abs(atan(sin(longitude), cos(longitude)));
      float core = exp(
        -(center_distance * center_distance) / 0.54
      );
      float band_half_width = mix(0.11, 0.24, core);
      float band_mask = 1.0 - smoothstep(
        band_half_width,
        band_half_width + 0.105,
        abs(galactic_latitude)
      );
      vec3 extracted = max(
        panorama - vec3(0.014, 0.018, 0.024),
        0.0
      );
      float extracted_luminance = dot(
        extracted,
        vec3(0.2126, 0.7152, 0.0722)
      );
      vec3 cool_gray = vec3(extracted_luminance) *
        vec3(0.82, 0.91, 1.08);
      vec3 graded = pow(
        mix(cool_gray, extracted, 0.34),
        vec3(0.9)
      ) * 0.92;
      float structure_alpha = clamp(
        (luminance - 0.026) * 2.7,
        0.0,
        0.62
      );
      float alpha = structure_alpha * band_mask * u_intensity;
      gl_FragColor = vec4(graded, alpha);
    }
  `;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const positionBuffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!positionBuffer || !texture) {
    gl.deleteProgram(program);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let textureReady = false;
  const panoramaImage = new Image();
  panoramaImage.decoding = "async";
  panoramaImage.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      panoramaImage,
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    textureReady = true;
  };
  panoramaImage.src = "/textures/eso-milky-way-panorama-4096.jpg";

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const panoramaLocation = gl.getUniformLocation(program, "u_panorama");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const fieldOfViewLocation = gl.getUniformLocation(
    program,
    "u_tan_half_fov",
  );
  const cameraLocation = gl.getUniformLocation(program, "u_camera_to_local");
  const latitudeLocation = gl.getUniformLocation(program, "u_latitude");
  const siderealLocation = gl.getUniformLocation(program, "u_sidereal");
  const intensityLocation = gl.getUniformLocation(program, "u_intensity");

  return {
    canvas,
    render(
      width,
      height,
      basis,
      fieldOfView,
      latitude,
      sidereal,
      intensity,
    ) {
      if (!textureReady) return false;
      const renderWidth = Math.max(1, Math.round(width));
      const renderHeight = Math.max(1, Math.round(height));
      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(panoramaLocation, 0);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(fieldOfViewLocation, Math.tan(fieldOfView * 0.5));
      gl.uniformMatrix3fv(
        cameraLocation,
        false,
        new Float32Array([
          basis.right[0],
          basis.right[1],
          basis.right[2],
          basis.up[0],
          basis.up[1],
          basis.up[2],
          basis.forward[0],
          basis.forward[1],
          basis.forward[2],
        ]),
      );
      gl.uniform1f(latitudeLocation, latitude);
      gl.uniform1f(siderealLocation, sidereal);
      gl.uniform1f(intensityLocation, intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
    dispose() {
      panoramaImage.onload = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
    },
  };
}

function basisForView(view: View) {
  const sinAzimuth = Math.sin(view.azimuth);
  const cosAzimuth = Math.cos(view.azimuth);
  const sinAltitude = Math.sin(view.altitude);
  const cosAltitude = Math.cos(view.altitude);
  return {
    forward: [
      sinAzimuth * cosAltitude,
      cosAzimuth * cosAltitude,
      sinAltitude,
    ],
    right: [cosAzimuth, -sinAzimuth, 0],
    up: [
      -sinAzimuth * sinAltitude,
      -cosAzimuth * sinAltitude,
      cosAltitude,
    ],
  };
}

function dotVector3(
  first: readonly number[],
  second: readonly number[],
) {
  return (
    first[0] * second[0] +
    first[1] * second[1] +
    first[2] * second[2]
  );
}

function normalizeVector3(vector: Vector3): Vector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [
    vector[0] / length,
    vector[1] / length,
    vector[2] / length,
  ];
}

function screenToLocalDirection(
  x: number,
  y: number,
  basis: ReturnType<typeof basisForView>,
  focal: number,
  width: number,
  height: number,
): Vector3 {
  const cameraX = (x - width * 0.5) / focal;
  const cameraY = -(y - height * 0.5) / focal;
  return normalizeVector3([
    basis.right[0] * cameraX +
      basis.up[0] * cameraY +
      basis.forward[0],
    basis.right[1] * cameraX +
      basis.up[1] * cameraY +
      basis.forward[1],
    basis.right[2] * cameraX +
      basis.up[2] * cameraY +
      basis.forward[2],
  ]);
}

function screenTangentAtDirection(
  x: number,
  y: number,
  stepX: number,
  stepY: number,
  direction: Vector3,
  basis: ReturnType<typeof basisForView>,
  focal: number,
  width: number,
  height: number,
) {
  const steppedDirection = screenToLocalDirection(
    x + stepX,
    y + stepY,
    basis,
    focal,
    width,
    height,
  );
  const cosine = clamp(dotVector3(direction, steppedDirection), -1, 1);
  const angularStep = Math.max(1e-7, Math.acos(cosine));
  const tangent = normalizeVector3([
    steppedDirection[0] - direction[0] * cosine,
    steppedDirection[1] - direction[1] * cosine,
    steppedDirection[2] - direction[2] * cosine,
  ]);
  return { tangent, angularStep };
}

function projectLocalDirection(
  local: Vector3,
  basis: ReturnType<typeof basisForView>,
  focal: number,
  width: number,
  height: number,
) {
  const cameraX = dotVector3(local, basis.right);
  const cameraY = dotVector3(local, basis.up);
  const cameraZ = dotVector3(local, basis.forward);
  if (cameraZ <= 0.025) return null;
  return {
    x: width * 0.5 + (cameraX / cameraZ) * focal,
    y: height * 0.5 - (cameraY / cameraZ) * focal,
    altitude: local[2],
    depth: cameraZ,
  };
}

function projectCelestial(
  ra: number,
  sinDec: number,
  cosDec: number,
  sidereal: number,
  latitude: number,
  basis: ReturnType<typeof basisForView>,
  focal: number,
  width: number,
  height: number,
) {
  const hourAngle = sidereal - ra;
  const sinHourAngle = Math.sin(hourAngle);
  const cosHourAngle = Math.cos(hourAngle);
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const local = [
    -cosDec * sinHourAngle,
    sinDec * cosLatitude - cosDec * cosHourAngle * sinLatitude,
    sinDec * sinLatitude + cosDec * cosHourAngle * cosLatitude,
  ];
  const cameraX =
    local[0] * basis.right[0] +
    local[1] * basis.right[1] +
    local[2] * basis.right[2];
  const cameraY =
    local[0] * basis.up[0] +
    local[1] * basis.up[1] +
    local[2] * basis.up[2];
  const cameraZ =
    local[0] * basis.forward[0] +
    local[1] * basis.forward[1] +
    local[2] * basis.forward[2];
  if (cameraZ <= 0.08) return null;
  return {
    x: width * 0.5 + (cameraX / cameraZ) * focal,
    y: height * 0.5 - (cameraY / cameraZ) * focal,
    altitude: local[2],
    depth: cameraZ,
  };
}

function createMeteor(
  kind: "ordinary" | "fireball",
  settings: Settings,
  width: number,
  height: number,
  now: number,
  basis: ReturnType<typeof basisForView>,
  focal: number,
  forced = false,
  variant: MeteorVariant = null,
): Meteor {
  let angleDegrees =
    settings.meteorAngle +
    (Math.random() - 0.5) * settings.directionSpread;
  // Sporadic meteors do not share one radiant. With wider spread enabled,
  // some tracks cross the frame in the opposite direction as well.
  if (Math.random() < Math.min(0.42, settings.directionSpread / 360)) {
    angleDegrees += 180;
  }
  const angle = angleDegrees * DEG;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  // One latent energy value keeps an ordinary meteor's visual properties
  // physically coherent: faint events are common, short and compact, while
  // bright events are rarer and may sustain a longer visible path.
  const ordinaryEnergy =
    kind === "ordinary" ? Math.pow(Math.random(), 1.7) : 0;
  const fireballBase =
    0.56 + settings.fireballEnergy * 0.86 + Math.random() * 0.38;
  const hasBurst =
    kind === "fireball" &&
    (variant !== null || Math.random() < settings.burstChance);
  const isExtreme =
    hasBurst &&
    Math.random() <
      (variant === "strong"
        ? 0.42
        : 0.06 + settings.fireballEnergy * 0.16);
  const strength =
    kind === "fireball"
      ? fireballBase *
        (variant === "strong" ? 1.34 : variant === "weak" ? 0.62 : 1) *
        (isExtreme ? 1.34 : 1)
      : 0.14 + ordinaryEnergy * 0.38;
  const fireballSpeedScale =
    variant === "strong"
      ? 0.25 + Math.random() * 0.09
      : variant === "weak"
        ? 0.47 + Math.random() * 0.13
        : 0.36 + Math.random() * 0.18;
  // Apparent speed still varies independently, but within a restrained range.
  // The small energy term prevents the brightest tracks from feeling sluggish
  // without forcing all ordinary meteors to move at the same speed.
  const ordinarySpeedScale =
    0.42 + Math.random() * 0.38 + ordinaryEnergy * 0.12;
  const speed =
    Math.max(width, 900) *
    settings.meteorSpeed *
    (kind === "fireball"
      ? fireballSpeedScale
      : ordinarySpeedScale);
  const ordinaryTrackLength =
    Math.min(width, height) *
    (0.065 +
      ordinaryEnergy * 0.18 +
      Math.random() * (0.022 + ordinaryEnergy * 0.035));

  let x: number;
  let y: number;
  if (forced) {
    x = directionX >= 0 ? width * 0.12 : width * 0.88;
    y = height * (0.2 + Math.random() * 0.5);
  } else if (kind === "ordinary") {
    // Short ordinary events ignite inside the field instead of entering from
    // far beyond the frame, so their sampled travel distance remains honest.
    const travelX = directionX * ordinaryTrackLength;
    const travelY = directionY * ordinaryTrackLength;
    const horizontalMargin = width * 0.055;
    const verticalMargin = height * 0.065;
    const minimumX = horizontalMargin - Math.min(0, travelX);
    const maximumX = width - horizontalMargin - Math.max(0, travelX);
    const minimumY = verticalMargin - Math.min(0, travelY);
    const maximumY = height - verticalMargin - Math.max(0, travelY);
    x = minimumX + Math.random() * Math.max(1, maximumX - minimumX);
    y = minimumY + Math.random() * Math.max(1, maximumY - minimumY);
  } else if (Math.abs(directionX) >= Math.abs(directionY)) {
    x = directionX >= 0 ? -width * 0.08 : width * 1.08;
    y = height * (0.06 + Math.random() * 0.72);
  } else {
    x = width * (0.06 + Math.random() * 0.88);
    y = directionY >= 0 ? -height * 0.1 : height * 1.08;
  }

  const direction = screenToLocalDirection(
    x,
    y,
    basis,
    focal,
    width,
    height,
  );
  const flightStep = screenTangentAtDirection(
    x,
    y,
    directionX,
    directionY,
    direction,
    basis,
    focal,
    width,
    height,
  );
  const curve = (Math.random() - 0.5) * (kind === "fireball" ? 5 : 2);
  const curveStep = screenTangentAtDirection(
    x,
    y,
    0,
    1,
    direction,
    basis,
    focal,
    width,
    height,
  );
  const angularVelocity: Vector3 = [
    flightStep.tangent[0] * flightStep.angularStep * speed,
    flightStep.tangent[1] * flightStep.angularStep * speed,
    flightStep.tangent[2] * flightStep.angularStep * speed,
  ];
  const angularAcceleration: Vector3 = [
    curveStep.tangent[0] * curveStep.angularStep * curve,
    curveStep.tangent[1] * curveStep.angularStep * curve,
    curveStep.tangent[2] * curveStep.angularStep * curve,
  ];

  const duration =
    kind === "fireball"
      ? variant === "strong"
        ? 0.98 + Math.random() * 0.18
        : variant === "weak"
          ? 0.68 + Math.random() * 0.16
          : 0.76 + Math.random() * 0.24
      : clamp(ordinaryTrackLength / Math.max(1, speed), 0.085, 0.36);
  const flareAt =
    hasBurst
      ? duration *
        clamp(
          settings.burstPosition +
            (variant === "strong" ? 0.07 : 0) +
            (Math.random() - 0.5) * 0.12,
          0.16,
          0.84,
        )
      : -10;
  const flareWidth =
    variant === "strong"
      ? 0.14 + Math.random() * 0.055
      : variant === "weak"
        ? 0.065 + Math.random() * 0.025
        : 0.09 + Math.random() * 0.04;
  const secondFlareAt =
    isExtreme
      ? Math.min(
          duration * 0.9,
          flareAt + duration * (0.17 + Math.random() * 0.12),
        )
      : -10;
  const trailLife =
    kind === "fireball"
      ? settings.afterglow *
        (variant === "strong"
          ? 2.85 + Math.random() * 0.35
          : variant === "weak"
            ? 0.88 + Math.random() * 0.16
            : 1.18 + Math.random() * 0.28)
      : 0.045 + ordinaryEnergy * 0.045 + settings.afterglow * 0.08;
  const ordinaryTailLength =
    Math.min(width, height) *
    (0.012 +
      ordinaryEnergy * 0.045 +
      Math.random() * (0.006 + ordinaryEnergy * 0.012));
  const bodyTime =
    (kind === "fireball"
      ? variant === "strong"
        ? 0.62 + Math.random() * 0.15
        : variant === "weak"
          ? 0.22 + Math.random() * 0.08
          : 0.36 + Math.random() * 0.16
      : Math.min(
          duration * 0.64,
          ordinaryTailLength / Math.max(1, speed),
        )) * settings.tailLength;

  return {
    kind,
    variant,
    strength,
    x,
    y,
    vx: directionX * speed,
    vy: directionY * speed,
    curve,
    direction,
    angularVelocity,
    angularAcceleration,
    born: now,
    duration,
    trailLife,
    bodyTime,
    attackTime:
      kind === "fireball"
        ? settings.ignitionTime *
          (variant === "strong"
            ? 2.45 + Math.random() * 0.55
            : variant === "weak"
              ? 0.9 + Math.random() * 0.3
              : 1.25 + Math.random() * 0.4)
        : 0.012 + ordinaryEnergy * 0.008,
    alive: true,
    lastSample: now,
    flareAt,
    secondFlareAt,
    flareWidth,
    flareStrength:
      kind === "fireball"
        ? (variant === "strong" ? 1.05 : 0.72) +
          strength * 0.62 +
          Math.random() * 0.45
        : 0,
    seed: Math.random() * 1000,
    points: [{
      x,
      y,
      direction: [...direction] as Vector3,
      born: now,
      energy: 0.22,
    }],
  };
}

function drawPointedCapsule(
  context: CanvasRenderingContext2D,
  tail: TrailPoint,
  head: TrailPoint,
  halfWidth: number,
  fill: CanvasGradient | string,
) {
  const deltaX = head.x - tail.x;
  const deltaY = head.y - tail.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const directionX = deltaX / length;
  const directionY = deltaY / length;
  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  const shoulderX = head.x - directionX * halfWidth * 0.58;
  const shoulderY = head.y - directionY * halfWidth * 0.58;
  const tipX = head.x + directionX * halfWidth * 0.22;
  const tipY = head.y + directionY * halfWidth * 0.22;
  const middleX = tail.x + deltaX * 0.5;
  const middleY = tail.y + deltaY * 0.5;

  context.beginPath();
  context.moveTo(tail.x, tail.y);
  context.quadraticCurveTo(
    middleX + normalX * halfWidth * 0.76,
    middleY + normalY * halfWidth * 0.76,
    shoulderX + normalX * halfWidth,
    shoulderY + normalY * halfWidth,
  );
  context.quadraticCurveTo(
    tipX + normalX * halfWidth * 0.62,
    tipY + normalY * halfWidth * 0.62,
    tipX,
    tipY,
  );
  context.quadraticCurveTo(
    tipX - normalX * halfWidth * 0.62,
    tipY - normalY * halfWidth * 0.62,
    shoulderX - normalX * halfWidth,
    shoulderY - normalY * halfWidth,
  );
  context.quadraticCurveTo(
    middleX - normalX * halfWidth * 0.76,
    middleY - normalY * halfWidth * 0.76,
    tail.x,
    tail.y,
  );
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function drawCapsuleHead(
  context: CanvasRenderingContext2D,
  head: TrailPoint,
  directionX: number,
  directionY: number,
  length: number,
  halfWidth: number,
  fill: CanvasGradient | string,
) {
  const capsuleLength = Math.max(length, halfWidth * 2);
  const rearCenter = -capsuleLength + halfWidth;
  const frontCenter = -halfWidth;

  context.save();
  context.translate(head.x, head.y);
  context.rotate(Math.atan2(directionY, directionX));
  context.beginPath();
  context.moveTo(rearCenter, -halfWidth);
  context.lineTo(frontCenter, -halfWidth);
  context.arc(frontCenter, 0, halfWidth, -Math.PI / 2, Math.PI / 2);
  context.lineTo(rearCenter, halfWidth);
  context.arc(rearCenter, 0, halfWidth, Math.PI / 2, (Math.PI * 3) / 2);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.restore();
}

function drawDirectionalWake(
  context: CanvasRenderingContext2D,
  head: TrailPoint,
  directionX: number,
  directionY: number,
  halfWidth: number,
  flare: number,
  age: number,
  seed: number,
) {
  const wakeStrength = clamp((flare - 0.18) / 1.8, 0, 1);
  if (wakeStrength <= 0) return;

  const normalX = -directionY;
  const normalY = directionX;
  context.save();
  context.globalCompositeOperation = "screen";

  for (let index = 0; index < 4; index += 1) {
    const sideNoise = temporalNoise(
      age * 2.2 + index * 2.7,
      seed + 1200 + index * 17,
    );
    const along = 2.5 + index * 3.2 + Math.abs(sideNoise) * 2.2;
    const side = sideNoise * halfWidth * (0.8 + index * 0.42);
    const centerX =
      head.x - directionX * along + normalX * side;
    const centerY =
      head.y - directionY * along + normalY * side;
    const radiusAlong =
      4.2 + index * 2.25 + wakeStrength * (2.8 + index * 0.7);
    const radiusAcross =
      halfWidth * (0.75 + index * 0.26) + 0.7;

    context.save();
    context.translate(centerX, centerY);
    context.rotate(Math.atan2(directionY, directionX));
    context.globalAlpha =
      wakeStrength * (0.078 - index * 0.009) *
      (0.72 + Math.abs(sideNoise) * 0.28);
    context.fillStyle =
      index < 2
        ? "rgba(224, 220, 204, 0.82)"
        : "rgba(106, 173, 111, 0.58)";
    context.beginPath();
    context.ellipse(0, 0, radiusAlong, radiusAcross, 0, 0, TAU);
    context.fill();
    context.restore();
  }

  context.lineCap = "round";
  for (let index = 0; index < 5; index += 1) {
    const sparkNoise = temporalNoise(
      age * 3.8 + index * 1.7,
      seed + 1400 + index * 29,
    );
    const along = 1.8 + index * 2.15 + Math.abs(sparkNoise) * 2.4;
    const side =
      sparkNoise * halfWidth * (1.15 + index * 0.34);
    const sparkX =
      head.x - directionX * along + normalX * side;
    const sparkY =
      head.y - directionY * along + normalY * side;
    const sparkLength = 0.8 + index * 0.36 + Math.abs(sparkNoise) * 1.1;

    context.globalAlpha =
      wakeStrength * (0.115 - index * 0.013);
    context.strokeStyle =
      index < 3
        ? "rgba(244, 239, 224, 0.76)"
        : "rgba(157, 194, 154, 0.55)";
    context.lineWidth = 0.28 + (index % 2) * 0.13;
    context.beginPath();
    context.moveTo(
      sparkX - directionX * sparkLength,
      sparkY - directionY * sparkLength,
    );
    context.lineTo(sparkX, sparkY);
    context.stroke();
  }

  context.restore();
}

function projectMeteorForView(
  meteor: Meteor,
  basis: ReturnType<typeof basisForView>,
  focal: number,
  width: number,
  height: number,
) {
  const projectedPoints: TrailPoint[] = [];
  for (const point of meteor.points) {
    const projected = projectLocalDirection(
      point.direction,
      basis,
      focal,
      width,
      height,
    );
    if (
      !projected ||
      projected.x < -width * 1.5 ||
      projected.x > width * 2.5 ||
      projected.y < -height * 1.5 ||
      projected.y > height * 2.5
    ) {
      continue;
    }
    projectedPoints.push({
      ...point,
      x: projected.x,
      y: projected.y,
    });
  }
  if (projectedPoints.length < 2) return null;

  const projectedHeadCandidate = projectLocalDirection(
    meteor.direction,
    basis,
    focal,
    width,
    height,
  );
  const projectedHead =
    projectedHeadCandidate &&
    projectedHeadCandidate.x >= -width * 1.5 &&
    projectedHeadCandidate.x <= width * 2.5 &&
    projectedHeadCandidate.y >= -height * 1.5 &&
    projectedHeadCandidate.y <= height * 2.5
      ? projectedHeadCandidate
      : null;
  const velocitySampleSeconds = 0.01;
  const velocityDirection = normalizeVector3([
    meteor.direction[0] +
      meteor.angularVelocity[0] * velocitySampleSeconds,
    meteor.direction[1] +
      meteor.angularVelocity[1] * velocitySampleSeconds,
    meteor.direction[2] +
      meteor.angularVelocity[2] * velocitySampleSeconds,
  ]);
  const projectedVelocitySample = projectLocalDirection(
    velocityDirection,
    basis,
    focal,
    width,
    height,
  );
  const newest = projectedPoints[projectedPoints.length - 1];
  const previous = projectedPoints[projectedPoints.length - 2];
  const sampleSeconds = Math.max(0.001, newest.born - previous.born);
  const vx =
    projectedHead && projectedVelocitySample
      ? (projectedVelocitySample.x - projectedHead.x) /
        velocitySampleSeconds
      : (newest.x - previous.x) / sampleSeconds;
  const vy =
    projectedHead && projectedVelocitySample
      ? (projectedVelocitySample.y - projectedHead.y) /
        velocitySampleSeconds
      : (newest.y - previous.y) / sampleSeconds;

  return {
    ...meteor,
    x: projectedHead?.x ?? newest.x,
    y: projectedHead?.y ?? newest.y,
    vx,
    vy,
    alive: meteor.alive && projectedHead !== null,
    points: projectedPoints,
  };
}

function drawMeteor(
  context: CanvasRenderingContext2D,
  meteor: Meteor,
  now: number,
) {
  const points = meteor.points;
  if (points.length < 2) return;
  const newest = points[points.length - 1];
  const age = now - meteor.born;
  const attack = smoothstep(0, meteor.attackTime, age);
  const terminalFade = 1 - smoothstep(meteor.duration * 0.78, meteor.duration, age);
  const firstFlare = Math.exp(
    -Math.pow((age - meteor.flareAt) / meteor.flareWidth, 2),
  );
  const secondFlare = Math.exp(
    -Math.pow(
      (age - meteor.secondFlareAt) / Math.max(0.045, meteor.flareWidth * 0.7),
      2,
    ),
  );
  const luminosityNoise = temporalNoise(
    age * (meteor.kind === "fireball" ? 34 : 23),
    meteor.seed + 412,
  );
  const flare =
    meteor.kind === "fireball"
      ? firstFlare * meteor.flareStrength +
        secondFlare * meteor.flareStrength * 0.72
      : 0;
  const liveIntensity = meteor.alive
    ? attack *
      terminalFade *
      (meteor.kind === "fireball"
        ? 0.68 + flare + Math.max(-0.08, luminosityNoise * 0.11)
        : 0.38 + meteor.strength * 1.25 + luminosityNoise * 0.07)
    : 0;

  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";

  // Fast-decaying ionisation persists where the brightening actually happened.
  if (meteor.kind === "fireball") {
    // Each sample is a short line segment. Butt caps join into one continuous
    // plasma trail; round caps would expose every sampling point as a bead.
    context.lineCap = "butt";
    const velocityLength = Math.hypot(meteor.vx, meteor.vy) || 1;
    const normalX = -meteor.vy / velocityLength;
    const normalY = meteor.vx / velocityLength;
    const residualDrift = meteor.variant === "strong" ? 2.4 : 0.5;
    const displaced = (point: TrailPoint) => {
      const pointAge = Math.max(0, now - point.born);
      const maturity = smoothstep(
        0.55,
        Math.max(0.72, meteor.trailLife),
        pointAge,
      );
      const drift =
        residualDrift *
        maturity *
        temporalNoise(
          point.born * 3.4 + pointAge * 0.64,
          meteor.seed + 817,
        );
      return {
        ...point,
        x: point.x + normalX * drift,
        y: point.y + normalY * drift,
      };
    };

    for (let index = 1; index < points.length; index += 1) {
      const first = points[index - 1];
      const second = points[index];
      const firstDrawn = displaced(first);
      const secondDrawn = displaced(second);
      const pointAge = now - second.born;
      const decay = Math.exp(-pointAge / Math.max(0.035, meteor.trailLife * 0.42));
      const irregularity =
        0.52 +
        0.48 *
          temporalNoise(
            second.born * 9.5,
            meteor.seed + 233,
          );
      const alpha = clamp(
        decay *
          second.energy *
          (0.14 + irregularity * 0.34) *
          (meteor.variant === "strong" ? 1.2 : 1),
        0,
        meteor.variant === "strong" ? 0.76 : 0.62,
      );
      if (alpha < 0.012) continue;

      context.globalAlpha = alpha * (meteor.variant === "strong" ? 0.1 : 0.075);
      context.strokeStyle = "rgba(72, 238, 78, 0.72)";
      context.lineWidth = 0.9 + second.energy * 0.72;
      context.shadowBlur = 0;
      context.beginPath();
      context.moveTo(firstDrawn.x, firstDrawn.y);
      context.lineTo(secondDrawn.x, secondDrawn.y);
      context.stroke();

      context.globalAlpha = alpha;
      context.shadowBlur = 0;
      context.strokeStyle =
        second.energy > 1.2
          ? "rgba(199, 255, 128, 0.86)"
          : "rgba(76, 239, 77, 0.78)";
      context.lineWidth = 0.26 + Math.min(0.72, second.energy * 0.27);
      context.beginPath();
      context.moveTo(firstDrawn.x, firstDrawn.y);
      context.lineTo(secondDrawn.x, secondDrawn.y);
      context.stroke();

      // A flare excites only a short section of the ionised path. Keeping this
      // tied to sampled energy avoids the synthetic, uniformly-green ribbon.
      const nextEnergy = points[index + 1]?.energy ?? -Infinity;
      if (
        second.energy > 1.3 &&
        second.energy >= first.energy &&
        second.energy >= nextEnergy
      ) {
        const localEnergy = Math.min(2.6, second.energy - 0.72);
        const bandTail = displaced(
          points[Math.max(0, index - Math.round(7 + localEnergy * 3))],
        );
        const bandHead = displaced(
          points[Math.min(points.length - 1, index + 3)],
        );
        const energyBand = context.createLinearGradient(
          bandTail.x,
          bandTail.y,
          bandHead.x,
          bandHead.y,
        );
        energyBand.addColorStop(0, "rgba(44, 239, 53, 0)");
        energyBand.addColorStop(0.28, "rgba(61, 255, 66, 0.42)");
        energyBand.addColorStop(0.64, "rgba(159, 255, 105, 0.9)");
        energyBand.addColorStop(1, "rgba(53, 245, 60, 0.08)");
        context.globalAlpha = clamp(
          decay * (0.2 + localEnergy * 0.28),
          0,
          0.82,
        );
        drawPointedCapsule(
          context,
          bandTail,
          bandHead,
          0.34 + localEnergy * 0.32,
          energyBand,
        );
      }
    }
  }
  context.lineCap = "round";

  if (liveIntensity > 0.015) {
    const bodyCutoff = now - meteor.bodyTime;
    let bodyStart = 0;
    while (
      bodyStart < points.length - 2 &&
      points[bodyStart].born < bodyCutoff
    ) {
      bodyStart += 1;
    }
    const tail = points[bodyStart];
    const baseWidth =
      meteor.kind === "fireball"
        ? (0.42 + meteor.strength * 0.58) *
          (0.12 + attack * 0.88) *
          (1 + Math.min(1.4, flare) * 0.2)
        : 0.34 + meteor.strength * 0.42;

    if (meteor.kind === "fireball") {
      const velocityLength = Math.hypot(meteor.vx, meteor.vy) || 1;
      const directionX = meteor.vx / velocityLength;
      const directionY = meteor.vy / velocityLength;
      const trailHalfWidth = baseWidth * 0.72;
      const bodyGradient = context.createLinearGradient(
        tail.x,
        tail.y,
        newest.x,
        newest.y,
      );
      bodyGradient.addColorStop(0, "rgba(34, 204, 47, 0)");
      bodyGradient.addColorStop(0.3, "rgba(51, 232, 59, 0.24)");
      bodyGradient.addColorStop(0.68, "rgba(78, 255, 75, 0.86)");
      bodyGradient.addColorStop(0.86, "rgba(188, 255, 153, 0.34)");
      bodyGradient.addColorStop(1, "rgba(239, 246, 229, 0.06)");

      // The camera spread is a narrow line-spread function aligned with the
      // flight path, not an isotropic neon shadow.
      context.globalAlpha = clamp(liveIntensity, 0, 1) * 0.075;
      context.shadowBlur = 0;
      drawPointedCapsule(
        context,
        tail,
        newest,
        trailHalfWidth * 1.9,
        bodyGradient,
      );

      context.globalAlpha = clamp(liveIntensity * 0.9, 0, 1);
      drawPointedCapsule(
        context,
        tail,
        newest,
        trailHalfWidth,
        bodyGradient,
      );

      // The hottest wake occupies only the most recent exposure samples. It
      // must not turn the whole green trail into a parallel white stripe.
      const hotCutoff =
        now - (0.038 + Math.min(0.046, Math.max(0, flare) * 0.012));
      let hotStart = points.length - 2;
      while (hotStart > 0 && points[hotStart].born > hotCutoff) {
        hotStart -= 1;
      }
      const hotTail = points[hotStart];
      const hotGradient = context.createLinearGradient(
        hotTail.x,
        hotTail.y,
        newest.x,
        newest.y,
      );
      hotGradient.addColorStop(0, "rgba(142, 255, 115, 0)");
      hotGradient.addColorStop(0.36, "rgba(199, 245, 183, 0.32)");
      hotGradient.addColorStop(0.72, "rgba(242, 239, 222, 0.82)");
      hotGradient.addColorStop(1, "rgba(255, 255, 250, 0.94)");
      context.globalAlpha = clamp(liveIntensity * 0.82, 0, 1);
      drawPointedCapsule(
        context,
        hotTail,
        newest,
        0.3 + baseWidth * 0.22,
        hotGradient,
      );

      const headLength = clamp(
        10 + velocityLength / 76 + Math.min(6, Math.max(0, flare) * 1.35),
        12,
        28,
      );
      const headHalfWidth = clamp(
        0.58 + baseWidth * 0.62 + Math.min(0.7, Math.max(0, flare) * 0.1),
        1.05,
        3.5,
      );
      const headRearX = newest.x - directionX * headLength;
      const headRearY = newest.y - directionY * headLength;
      const headFrontX = newest.x + directionX * headHalfWidth;
      const headFrontY = newest.y + directionY * headHalfWidth;

      drawDirectionalWake(
        context,
        newest,
        directionX,
        directionY,
        headHalfWidth,
        flare,
        age,
        meteor.seed,
      );

      const outerHead = context.createLinearGradient(
        headRearX,
        headRearY,
        headFrontX,
        headFrontY,
      );
      outerHead.addColorStop(0, "rgba(62, 229, 66, 0)");
      outerHead.addColorStop(0.42, "rgba(108, 230, 102, 0.18)");
      outerHead.addColorStop(0.72, "rgba(229, 226, 210, 0.34)");
      outerHead.addColorStop(1, "rgba(255, 245, 235, 0)");
      context.globalAlpha = clamp(liveIntensity, 0, 1) * 0.16;
      drawCapsuleHead(
        context,
        newest,
        directionX,
        directionY,
        headLength * 1.2,
        headHalfWidth * 2.25,
        outerHead,
      );

      const headGradient = context.createLinearGradient(
        headRearX,
        headRearY,
        headFrontX,
        headFrontY,
      );
      headGradient.addColorStop(0, "rgba(102, 246, 91, 0)");
      headGradient.addColorStop(0.24, "rgba(167, 255, 139, 0.55)");
      headGradient.addColorStop(0.52, "rgba(239, 243, 222, 0.92)");
      headGradient.addColorStop(0.84, "rgba(255, 254, 246, 1)");
      headGradient.addColorStop(1, "rgba(255, 255, 255, 0.76)");
      context.globalAlpha = clamp(liveIntensity * 0.94, 0, 1);
      drawCapsuleHead(
        context,
        newest,
        directionX,
        directionY,
        headLength,
        headHalfWidth,
        headGradient,
      );

      const coreGradient = context.createLinearGradient(
        newest.x - directionX * headLength * 0.72,
        newest.y - directionY * headLength * 0.72,
        headFrontX,
        headFrontY,
      );
      coreGradient.addColorStop(0, "rgba(238, 250, 226, 0)");
      coreGradient.addColorStop(0.4, "rgba(255, 255, 244, 0.86)");
      coreGradient.addColorStop(1, "rgba(255, 255, 255, 0.98)");
      context.globalAlpha = clamp(liveIntensity, 0, 1);
      drawCapsuleHead(
        context,
        newest,
        directionX,
        directionY,
        headLength * 0.72,
        Math.max(0.42, headHalfWidth * 0.38),
        coreGradient,
      );
    } else {
      const gradient = context.createLinearGradient(
        tail.x,
        tail.y,
        newest.x,
        newest.y,
      );
      gradient.addColorStop(0, "rgba(193, 219, 255, 0)");
      gradient.addColorStop(0.7, "rgba(225, 238, 255, 0.74)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 1)");

      context.globalAlpha = clamp(liveIntensity, 0, 1.2) * 0.13;
      context.shadowBlur = 2;
      context.shadowColor = "rgba(192, 221, 255, 0.55)";
      drawPointedCapsule(
        context,
        tail,
        newest,
        baseWidth * 2,
        gradient,
      );

      context.globalAlpha = clamp(liveIntensity, 0, 1);
      context.shadowBlur = 1;
      drawPointedCapsule(context, tail, newest, baseWidth, gradient);

      const bloomRadius = 0.72 + meteor.strength * 1.2;
      const bloom = context.createRadialGradient(
        newest.x,
        newest.y,
        0,
        newest.x,
        newest.y,
        bloomRadius,
      );
      bloom.addColorStop(0, "rgba(255, 255, 255, 0.96)");
      bloom.addColorStop(0.2, "rgba(211, 229, 255, 0.3)");
      bloom.addColorStop(1, "rgba(160, 205, 255, 0)");
      context.globalAlpha = clamp(liveIntensity * 0.72, 0, 1);
      context.shadowBlur = 0;
      context.fillStyle = bloom;
      context.beginPath();
      context.arc(newest.x, newest.y, bloomRadius, 0, TAU);
      context.fill();
    }
  }

  context.restore();
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  display,
  track = "neutral",
  trackHue = 0,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  track?: "neutral" | "hue" | "saturation";
  trackHue?: number;
  onChange: (value: number) => void;
}) {
  const rangeStyle =
    track === "saturation"
      ? ({ "--range-hue": trackHue } as CSSProperties)
      : undefined;
  return (
    <label className="control">
      <span className="control-line">
        <span>{label}</span>
        <span className="control-value">{display}</span>
      </span>
      <input
        className={`range${track === "neutral" ? "" : ` ${track}-range`}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={rangeStyle}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
    </label>
  );
}

type Locale = "zh-CN" | "en";

const UI_COPY = {
  "zh-CN": {
    pageTitle: "AstroShot · 真实星空与流星模拟器",
    canvasLabel: "可拖拽旋转视角的真实星空模拟画布",
    openPanel: "打开参数面板",
    closePanel: "关闭参数面板",
    panelAria: "星空模拟参数",
    title: "AstroShot",
    languageLabel: "切换为英文",
    environment: "观测环境",
    rotation: "地球自转",
    latitude: "观测纬度",
    skyBrightness: "天空亮度",
    skyHue: "天空色相",
    skySaturation: "天空饱和度",
    sensorNoise: "感光噪点",
    sensorNoiseDescription: "模拟高感光度传感器颗粒",
    noiseStrength: "噪点强度",
    starAppearance: "恒星表现",
    starExposure: "星光曝光",
    twinkle: "大气闪烁",
    meteorSystem: "流星系统",
    meteorRate: "出现频率",
    meteorSpeed: "速度基准",
    ordinaryWeight: "普通流星权重",
    fireballWeight: "火流星权重",
    fireballEnergy: "火流星能级",
    ignitionTime: "起燃时间",
    burstChance: "爆亮概率",
    burstPosition: "爆亮位置",
    tailLength: "尾迹长度",
    afterglow: "残影寿命",
    meteorAngle: "流星倾角",
    directionSpread: "方向散布",
    triggerOrdinary: "触发普通流星",
    triggerWeak: "触发弱火流星",
    triggerStrong: "触发强火流星",
    pause: "暂停时间",
    resume: "继续模拟",
    stars: "颗恒星",
    loading: "加载中",
  },
  en: {
    pageTitle: "AstroShot · Real Sky & Meteor Simulator",
    canvasLabel: "Draggable real-sky simulation canvas",
    openPanel: "Open settings",
    closePanel: "Close settings",
    panelAria: "Sky simulation settings",
    title: "AstroShot",
    languageLabel: "Switch to Chinese",
    environment: "Observation",
    rotation: "Earth rotation",
    latitude: "Observer latitude",
    skyBrightness: "Sky brightness",
    skyHue: "Sky hue",
    skySaturation: "Sky saturation",
    sensorNoise: "Sensor noise",
    sensorNoiseDescription: "Simulate high-ISO sensor grain",
    noiseStrength: "Noise intensity",
    starAppearance: "Star Appearance",
    starExposure: "Star exposure",
    twinkle: "Atmospheric twinkle",
    meteorSystem: "Meteor System",
    meteorRate: "Appearance rate",
    meteorSpeed: "Base speed",
    ordinaryWeight: "Ordinary meteor weight",
    fireballWeight: "Fireball weight",
    fireballEnergy: "Fireball energy",
    ignitionTime: "Ignition time",
    burstChance: "Flare probability",
    burstPosition: "Flare position",
    tailLength: "Trail length",
    afterglow: "Afterglow lifetime",
    meteorAngle: "Meteor angle",
    directionSpread: "Direction spread",
    triggerOrdinary: "Trigger ordinary meteor",
    triggerWeak: "Trigger weak fireball",
    triggerStrong: "Trigger strong fireball",
    pause: "Pause time",
    resume: "Resume simulation",
    stars: "stars",
    loading: "Loading",
  },
} as const;

function SettingsPanel({
  settings,
  setSettings,
  catalogCount,
  catalogReady,
  locale,
  onLocaleChange,
}: {
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  catalogCount: number;
  catalogReady: boolean;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const copy = UI_COPY[locale];
  const update = useCallback(
    <Key extends keyof Settings>(key: Key, value: Settings[Key]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [setSettings],
  );

  const summon = (kind: MeteorSummon) => {
    window.dispatchEvent(new CustomEvent("sky:meteor", { detail: kind }));
  };

  const totalWeight = settings.ordinaryWeight + settings.fireballWeight || 1;
  const ordinaryPercent = Math.round((settings.ordinaryWeight / totalWeight) * 100);
  const fireballPercent = 100 - ordinaryPercent;

  return (
    <aside className="control-panel" aria-label={copy.panelAria}>
      <div className="panel-heading">
        <div>
          <h2>{copy.title}</h2>
        </div>
        <button
          className="locale-toggle"
          type="button"
          aria-label={copy.languageLabel}
          onClick={() => onLocaleChange(locale === "zh-CN" ? "en" : "zh-CN")}
        >
          <span className={locale === "zh-CN" ? "active" : ""}>中</span>
          <span className="locale-divider">/</span>
          <span className={locale === "en" ? "active" : ""}>EN</span>
        </button>
      </div>

      <details className="section">
        <summary className="section-toggle">
          <span>{copy.environment}</span>
          <span className="section-chevron" aria-hidden="true" />
        </summary>
        <div className="section-content">
          <RangeControl
          label={copy.rotation}
          value={settings.rotationSpeed}
          min={0}
          max={720}
          step={1}
          display={`${settings.rotationSpeed}×`}
          onChange={(value) => update("rotationSpeed", value)}
        />
        <RangeControl
          label={copy.latitude}
          value={settings.latitude}
          min={-70}
          max={70}
          step={0.1}
          display={`${Math.abs(settings.latitude).toFixed(1)}°${settings.latitude >= 0 ? "N" : "S"}`}
          onChange={(value) => update("latitude", value)}
        />
        <RangeControl
          label={copy.skyBrightness}
          value={settings.skyBrightness}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(settings.skyBrightness * 100)}%`}
          onChange={(value) => update("skyBrightness", value)}
        />
        <RangeControl
          label={copy.skyHue}
          value={settings.skyHue}
          min={0}
          max={360}
          step={1}
          display={`${settings.skyHue}°`}
          track="hue"
          onChange={(value) => update("skyHue", value)}
        />
        <RangeControl
          label={copy.skySaturation}
          value={settings.skySaturation}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(settings.skySaturation * 100)}%`}
          track="saturation"
          trackHue={settings.skyHue}
          onChange={(value) => update("skySaturation", value)}
        />
        <div className="toggle-control">
          <span>
            <strong>{copy.sensorNoise}</strong>
            <small>{copy.sensorNoiseDescription}</small>
          </span>
          <button
            type="button"
            className={`noise-toggle${settings.noiseEnabled ? " active" : ""}`}
            onClick={() => update("noiseEnabled", !settings.noiseEnabled)}
            aria-pressed={settings.noiseEnabled}
          >
            {settings.noiseEnabled ? "ON" : "OFF"}
          </button>
        </div>
          <RangeControl
            label={copy.noiseStrength}
            value={settings.sensorNoise}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(settings.sensorNoise * 100)}%`}
            onChange={(value) => update("sensorNoise", value)}
          />
        </div>
      </details>

      <details className="section">
        <summary className="section-toggle">
          <span>{copy.starAppearance}</span>
          <span className="section-chevron" aria-hidden="true" />
        </summary>
        <div className="section-content">
          <RangeControl
          label={copy.starExposure}
          value={settings.starExposure}
          min={0.45}
          max={6.4}
          step={0.01}
          display={`${settings.starExposure.toFixed(2)}×`}
          onChange={(value) => update("starExposure", value)}
        />
          <RangeControl
            label={copy.twinkle}
            value={settings.twinkle}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(settings.twinkle * 100)}%`}
            onChange={(value) => update("twinkle", value)}
          />
        </div>
      </details>

      <details className="section">
        <summary className="section-toggle">
          <span>{copy.meteorSystem}</span>
          <span className="section-chevron" aria-hidden="true" />
        </summary>
        <div className="section-content">
          <RangeControl
          label={copy.meteorRate}
          value={settings.meteorRate}
          min={0}
          max={60}
          step={1}
          display={`${settings.meteorRate}/min`}
          onChange={(value) => update("meteorRate", value)}
        />
        <RangeControl
          label={copy.meteorSpeed}
          value={settings.meteorSpeed}
          min={0.45}
          max={1.8}
          step={0.01}
          display={`${settings.meteorSpeed.toFixed(2)}×`}
          onChange={(value) => update("meteorSpeed", value)}
        />
        <RangeControl
          label={copy.ordinaryWeight}
          value={settings.ordinaryWeight}
          min={0}
          max={100}
          step={1}
          display={`${ordinaryPercent}%`}
          onChange={(value) => update("ordinaryWeight", value)}
        />
        <RangeControl
          label={copy.fireballWeight}
          value={settings.fireballWeight}
          min={0}
          max={100}
          step={1}
          display={`${fireballPercent}%`}
          onChange={(value) => update("fireballWeight", value)}
        />
        <RangeControl
          label={copy.fireballEnergy}
          value={settings.fireballEnergy}
          min={0.1}
          max={1}
          step={0.01}
          display={`${Math.round(settings.fireballEnergy * 100)}%`}
          onChange={(value) => update("fireballEnergy", value)}
        />
        <RangeControl
          label={copy.ignitionTime}
          value={settings.ignitionTime}
          min={0.03}
          max={0.28}
          step={0.005}
          display={`${Math.round(settings.ignitionTime * 1000)}ms`}
          onChange={(value) => update("ignitionTime", value)}
        />
        <RangeControl
          label={copy.burstChance}
          value={settings.burstChance}
          min={0}
          max={1}
          step={0.01}
          display={`${Math.round(settings.burstChance * 100)}%`}
          onChange={(value) => update("burstChance", value)}
        />
        <RangeControl
          label={copy.burstPosition}
          value={settings.burstPosition}
          min={0.16}
          max={0.82}
          step={0.01}
          display={`${Math.round(settings.burstPosition * 100)}%`}
          onChange={(value) => update("burstPosition", value)}
        />
        <RangeControl
          label={copy.tailLength}
          value={settings.tailLength}
          min={0.35}
          max={2}
          step={0.01}
          display={`${settings.tailLength.toFixed(2)}×`}
          onChange={(value) => update("tailLength", value)}
        />
        <RangeControl
          label={copy.afterglow}
          value={settings.afterglow}
          min={0.08}
          max={2.4}
          step={0.01}
          display={`${settings.afterglow.toFixed(2)}s`}
          onChange={(value) => update("afterglow", value)}
        />
        <RangeControl
          label={copy.meteorAngle}
          value={settings.meteorAngle}
          min={-35}
          max={35}
          step={1}
          display={`${settings.meteorAngle > 0 ? "+" : ""}${settings.meteorAngle}°`}
          onChange={(value) => update("meteorAngle", value)}
        />
        <RangeControl
          label={copy.directionSpread}
          value={settings.directionSpread}
          min={0}
          max={180}
          step={1}
          display={`${settings.directionSpread}°`}
          onChange={(value) => update("directionSpread", value)}
        />
        <div className="demo-actions">
          <button
            className="demo-button ordinary"
            type="button"
            onClick={() => summon("ordinary")}
          >
            {copy.triggerOrdinary}
          </button>
          <button
            className="demo-button fireball"
            type="button"
            onClick={() => summon("weak-fireball")}
          >
            {copy.triggerWeak}
          </button>
          <button
            className="demo-button fireball strong"
            type="button"
            onClick={() => summon("strong-fireball")}
          >
            {copy.triggerStrong}
          </button>
        </div>
          <button
            className="pause-button"
            type="button"
            onClick={() => update("paused", !settings.paused)}
          >
            {settings.paused ? copy.resume : copy.pause}
          </button>
        </div>
      </details>

      <div className="data-note">
        <span>HYG v4.1 · HIPPARCOS / YALE / GLIESE<br />CC BY-SA 4.0</span>
        <span className="data-count">
          {catalogReady
            ? `${catalogCount.toLocaleString(locale)} ${copy.stars}`
            : copy.loading}
        </span>
      </div>
    </aside>
  );
}

export function SkySimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const [catalogCount, setCatalogCount] = useState(0);
  const [catalogReady, setCatalogReady] = useState(false);
  const copy = UI_COPY[locale];

  useEffect(() => {
    const storedLocale = window.localStorage.getItem("sky-locale");
    const preferredLocale =
      storedLocale === "zh-CN" || storedLocale === "en"
        ? storedLocale
        : window.navigator.language.toLowerCase().startsWith("zh")
          ? "zh-CN"
          : "en";
    if (preferredLocale === "zh-CN") {
      return;
    }
    const localeTimer = window.setTimeout(() => setLocale(preferredLocale), 0);
    return () => window.clearTimeout(localeTimer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = copy.pageTitle;
  }, [copy.pageTitle, locale]);

  const updateLocale = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
    window.localStorage.setItem("sky-locale", nextLocale);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    let width = 0;
    let height = 0;
    let deviceScale = 1;
    let animationFrame = 0;
    let stars: RenderStar[] = [];
    let sidereal = currentSiderealAngle();
    let previousTime = performance.now() / 1000;
    let nextMeteorTime = previousTime + 0.75;
    let destroyed = false;
    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;
    const view = { ...DEFAULT_VIEW };
    const meteors: Meteor[] = [];
    const galacticPanorama = createGalacticPanoramaRenderer();
    const noiseCanvas = document.createElement("canvas");
    const noiseContext = noiseCanvas.getContext("2d");
    let noiseImage: ImageData | null = null;
    let noiseFrame = 0;

    const resize = () => {
      const rectangle = canvas.getBoundingClientRect();
      width = Math.max(1, rectangle.width);
      height = Math.max(1, rectangle.height);
      deviceScale = Math.min(1.35, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * deviceScale);
      canvas.height = Math.round(height * deviceScale);
      context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
      noiseCanvas.width = Math.min(360, Math.max(220, Math.round(width * 0.28)));
      noiseCanvas.height = Math.min(
        210,
        Math.max(124, Math.round(height * 0.28)),
      );
      noiseImage = noiseContext?.createImageData(
        noiseCanvas.width,
        noiseCanvas.height,
      ) ?? null;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    fetch("/data/stars.json")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load star catalogue");
        return response.json() as Promise<Catalog>;
      })
      .then((catalog) => {
        if (destroyed) return;
        stars = catalog.stars.map((row, index) => ({
          ra: row[0],
          sinDec: Math.sin(row[1]),
          cosDec: Math.cos(row[1]),
          magnitude: row[2],
          color: colorFromBv(row[3]),
          phase: seeded(index + 11) * TAU,
          frequency: 0.55 + seeded(index + 711) * 2.4,
          name: row[4],
        }));
        setCatalogCount(catalog.count);
        setCatalogReady(true);
      })
      .catch(() => {
        if (!destroyed) setCatalogReady(false);
      });

    const spawn = (
      kind: "ordinary" | "fireball",
      now: number,
      forced = false,
      variant: MeteorVariant = null,
    ) => {
      const spawnBasis = basisForView(view);
      const spawnFocal = height / (2 * Math.tan(view.fov * 0.5));
      meteors.push(
        createMeteor(
          kind,
          settingsRef.current,
          width,
          height,
          now,
          spawnBasis,
          spawnFocal,
          forced,
          variant,
        ),
      );
    };

    const summonMeteor = (event: Event) => {
      const summon = (event as CustomEvent<MeteorSummon>).detail;
      if (summon === "ordinary") {
        spawn("ordinary", performance.now() / 1000, true);
        return;
      }
      const variant =
        summon === "weak-fireball"
          ? "weak"
          : summon === "strong-fireball"
            ? "strong"
            : null;
      spawn("fireball", performance.now() / 1000, true, variant);
    };
    window.addEventListener("sky:meteor", summonMeteor);

    const pointerDown = (event: PointerEvent) => {
      dragging = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const deltaX = event.clientX - pointerX;
      const deltaY = event.clientY - pointerY;
      view.azimuth -= deltaX * 0.0042;
      view.altitude = clamp(view.altitude + deltaY * 0.0036, -8 * DEG, 87 * DEG);
      pointerX = event.clientX;
      pointerY = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      view.fov = clamp(view.fov + event.deltaY * 0.00045, 30 * DEG, 86 * DEG);
    };
    const keyDown = (event: KeyboardEvent) => {
      const amount = event.shiftKey ? 5 * DEG : 1.5 * DEG;
      if (event.key === "ArrowLeft") view.azimuth += amount;
      if (event.key === "ArrowRight") view.azimuth -= amount;
      if (event.key === "ArrowUp") {
        view.altitude = clamp(view.altitude + amount, -8 * DEG, 87 * DEG);
      }
      if (event.key === "ArrowDown") {
        view.altitude = clamp(view.altitude - amount, -8 * DEG, 87 * DEG);
      }
    };
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", keyDown);

    const drawBackground = (
      basis: ReturnType<typeof basisForView>,
      _focal: number,
      settingsNow: Settings,
    ) => {
      const brightness = settingsNow.skyBrightness;
      const saturation = settingsNow.skySaturation;
      const topLightness = 1.4 + brightness * 3.2;
      const bottomLightness = 3.3 + brightness * 8.8;
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(
        0,
        `hsl(${settingsNow.skyHue}, ${saturation * 90}%, ${topLightness}%)`,
      );
      gradient.addColorStop(
        0.62,
        `hsl(${settingsNow.skyHue - 2}, ${saturation * 85}%, ${2.5 + brightness * 5.4}%)`,
      );
      gradient.addColorStop(
        1,
        `hsl(${settingsNow.skyHue - 7}, ${saturation * 100}%, ${bottomLightness}%)`,
      );
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      const latitude = settingsNow.latitude * DEG;
      const panoramaRendered =
        galacticPanorama?.render(
          width,
          height,
          basis,
          view.fov,
          latitude,
          sidereal,
          0.22 + brightness * 0.12,
        ) ?? false;
      if (panoramaRendered && galacticPanorama) {
        context.globalCompositeOperation = "screen";
        context.globalAlpha = 0.72 + brightness * 0.08;
        context.drawImage(galacticPanorama.canvas, 0, 0, width, height);
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    };

    const drawStars = (
      basis: ReturnType<typeof basisForView>,
      focal: number,
      settingsNow: Settings,
      now: number,
    ) => {
      const latitude = settingsNow.latitude * DEG;
      const visibleMagnitude =
        6.48 +
        (settingsNow.starExposure - 0.78) * 0.62 -
        settingsNow.skyBrightness * 0.82;
      const exposureGain =
        settingsNow.starExposure <= 1.8
          ? settingsNow.starExposure
          : 1.8 + (settingsNow.starExposure - 1.8) * 0.38;
      context.globalCompositeOperation = "lighter";
      let visibleCount = 0;

      for (let index = 0; index < stars.length; index += 1) {
        const star = stars[index];
        if (star.magnitude > visibleMagnitude) continue;
        const point = projectCelestial(
          star.ra,
          star.sinDec,
          star.cosDec,
          sidereal,
          latitude,
          basis,
          focal,
          width,
          height,
        );
        if (
          !point ||
          point.x < -8 ||
          point.x > width + 8 ||
          point.y < -8 ||
          point.y > height + 8 ||
          point.altitude < -0.018
        ) {
          continue;
        }

        const atmosphere = smoothstep(-0.018, 0.14, point.altitude);
        const horizonScintillation =
          0.42 + 0.58 * (1 - smoothstep(0.025, 0.68, point.altitude));
        const slowNoise = temporalNoise(
          now * star.frequency * 3.1 + star.phase,
          index + 31,
        );
        const fastNoise = temporalNoise(
          now * (7.2 + star.frequency * 2.8) + star.phase * 4.2,
          index + 907,
        );
        const glintNoise = temporalNoise(
          now * (13.5 + star.frequency * 4.3) + star.phase * 8.4,
          index + 1907,
        );
        const visibility = clamp(
          (visibleMagnitude - star.magnitude) / 3.15,
          0,
          1,
        );
        const scintillationAmplitude =
          settingsNow.twinkle *
          horizonScintillation *
          (0.22 + visibility * 0.38);
        const scintillationSignal =
          slowNoise * 0.54 +
          fastNoise * 0.46 +
          Math.pow(Math.max(0, glintNoise), 9) *
            0.82;
        const scintillation = Math.exp(
          scintillationAmplitude * scintillationSignal,
        );
        const defocus = seeded(index + 2771);
        const focusTransmission =
          1 - defocus * (1 - visibility) * 0.22;
        const alpha = clamp(
          (0.035 + Math.pow(visibility, 1.08) * 0.68) *
            atmosphere *
            scintillation *
            exposureGain *
            focusTransmission,
          0.009,
          0.86,
        );
        const radius = clamp(
          (0.2 +
            Math.pow(visibility, 1.82) * 0.78 +
            defocus * (1 - visibility) * 0.14) *
            (1 + (scintillation - 1) * 0.27),
          0.18,
          star.magnitude < 0 ? 1.52 : 1.08,
        );
        const imageMotion =
          settingsNow.twinkle *
          horizonScintillation *
          (0.08 + (1 - visibility) * 0.16);
        const starX =
          point.x +
          temporalNoise(
            now * (8.2 + star.frequency * 1.7) + star.phase * 2.9,
            index + 4271,
          ) *
            imageMotion;
        const starY =
          point.y +
          temporalNoise(
            now * (9.4 + star.frequency * 1.3) + star.phase * 3.7,
            index + 5297,
          ) *
            imageMotion;
        const chromaticShift = fastNoise * settingsNow.twinkle * 0.035;
        const red = Math.round(
          clamp(star.color[0] * 0.34 + 224 * 0.66 + chromaticShift * 150, 0, 255),
        );
        const green = Math.round(
          clamp(star.color[1] * 0.3 + 230 * 0.7, 0, 255),
        );
        const blue = Math.round(
          clamp(star.color[2] * 0.34 + 234 * 0.66 - chromaticShift * 110, 0, 255),
        );

        const glint = Math.pow(Math.max(0, glintNoise), 9);
        if (visibility < 0.56 && defocus > 0.76) {
          const softRadius = radius * (1.8 + defocus * 0.8);
          const softDisc = context.createRadialGradient(
            starX,
            starY,
            0,
            starX,
            starY,
            softRadius,
          );
          softDisc.addColorStop(
            0,
            `rgba(${red},${green},${blue},${alpha * 0.34})`,
          );
          softDisc.addColorStop(1, `rgba(${red},${green},${blue},0)`);
          context.globalAlpha = 1;
          context.fillStyle = softDisc;
          context.beginPath();
          context.arc(starX, starY, softRadius, 0, TAU);
          context.fill();
        }
        if (star.magnitude < 1.15 || (star.magnitude < 2.8 && glint > 0.18)) {
          const glowRadius = radius * (3.1 + settingsNow.starExposure);
          const glintBoost = glint * settingsNow.twinkle;
          const glow = context.createRadialGradient(
            starX,
            starY,
            0,
            starX,
            starY,
            glowRadius,
          );
          glow.addColorStop(
            0,
            `rgba(${red},${green},${blue},${alpha * (0.38 + glintBoost * 0.42)})`,
          );
          glow.addColorStop(
            0.2,
            `rgba(${red},${green},${blue},${alpha * (0.1 + glintBoost * 0.18)})`,
          );
          glow.addColorStop(1, `rgba(${red},${green},${blue},0)`);
          context.globalAlpha = 1;
          context.fillStyle = glow;
          context.beginPath();
          context.arc(starX, starY, glowRadius, 0, TAU);
          context.fill();
        }

        context.globalAlpha = alpha;
        context.fillStyle = `rgb(${red},${green},${blue})`;
        context.beginPath();
        context.arc(starX, starY, radius, 0, TAU);
        context.fill();
        visibleCount += 1;
      }
      context.shadowBlur = 0;
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      return visibleCount;
    };

    const drawHorizon = (focal: number) => {
      const horizonY = height * 0.5 + Math.tan(view.altitude) * focal;
      if (horizonY > height + 150) return;

      const haze = context.createLinearGradient(
        0,
        horizonY - 130,
        0,
        horizonY + 25,
      );
      haze.addColorStop(0, "rgba(44, 95, 60, 0)");
      haze.addColorStop(0.72, "rgba(50, 101, 61, 0.07)");
      haze.addColorStop(1, "rgba(5, 11, 8, 0.38)");
      context.fillStyle = haze;
      context.fillRect(0, Math.max(0, horizonY - 130), width, 180);

      context.beginPath();
      context.moveTo(0, height);
      context.lineTo(0, horizonY + 18);
      const steps = Math.max(24, Math.ceil(width / 45));
      for (let index = 0; index <= steps; index += 1) {
        const x = (index / steps) * width;
        const ridge =
          Math.sin(index * 0.71 + 1.2) * 9 +
          Math.sin(index * 0.19 + 4.1) * 21 +
          Math.sin(index * 1.73) * 3;
        context.lineTo(x, horizonY - 8 - ridge);
      }
      context.lineTo(width, height);
      context.closePath();
      const ground = context.createLinearGradient(0, horizonY - 45, 0, height);
      ground.addColorStop(0, "rgba(2, 8, 5, 0.96)");
      ground.addColorStop(1, "#010302");
      context.fillStyle = ground;
      context.fill();
    };

    const drawSensorNoise = (settingsNow: Settings) => {
      if (
        !settingsNow.noiseEnabled ||
        settingsNow.sensorNoise <= 0 ||
        !noiseContext ||
        !noiseImage
      ) {
        return;
      }

      noiseFrame += 1;
      if (noiseFrame % 5 === 1) {
        const pixels = noiseImage.data;
        for (let index = 0; index < pixels.length; index += 4) {
          const grain = 72 + Math.random() * 156;
          const tint = (Math.random() - 0.5) * 18;
          pixels[index] = grain - tint * 0.3;
          pixels[index + 1] = grain + tint;
          pixels[index + 2] = grain - tint * 0.15;
          pixels[index + 3] = 255;
        }
        noiseContext.putImageData(noiseImage, 0, 0);
      }

      context.save();
      context.globalCompositeOperation = "screen";
      context.globalAlpha = 0.012 + settingsNow.sensorNoise * 0.052;
      context.imageSmoothingEnabled = true;
      context.drawImage(noiseCanvas, 0, 0, width, height);
      context.restore();
    };

    const updateMeteors = (delta: number, now: number, settingsNow: Settings) => {
      if (!settingsNow.paused && settingsNow.meteorRate > 0 && now >= nextMeteorTime) {
        const total = settingsNow.ordinaryWeight + settingsNow.fireballWeight;
        const chance =
          total <= 0 ? 0 : settingsNow.fireballWeight / Math.max(1, total);
        spawn(Math.random() < chance ? "fireball" : "ordinary", now);
        const meanInterval = 60 / settingsNow.meteorRate;
        nextMeteorTime = now + Math.max(0.12, -Math.log(Math.max(0.001, Math.random())) * meanInterval);
      }

      for (let index = meteors.length - 1; index >= 0; index -= 1) {
        const meteor = meteors[index];
        if (!settingsNow.paused && meteor.alive) {
          const age = now - meteor.born;
          meteor.angularVelocity[0] +=
            meteor.angularAcceleration[0] * delta;
          meteor.angularVelocity[1] +=
            meteor.angularAcceleration[1] * delta;
          meteor.angularVelocity[2] +=
            meteor.angularAcceleration[2] * delta;
          meteor.direction = normalizeVector3([
            meteor.direction[0] + meteor.angularVelocity[0] * delta,
            meteor.direction[1] + meteor.angularVelocity[1] * delta,
            meteor.direction[2] + meteor.angularVelocity[2] * delta,
          ]);
          const radialVelocity = dotVector3(
            meteor.angularVelocity,
            meteor.direction,
          );
          meteor.angularVelocity = [
            meteor.angularVelocity[0] -
              meteor.direction[0] * radialVelocity,
            meteor.angularVelocity[1] -
              meteor.direction[1] * radialVelocity,
            meteor.angularVelocity[2] -
              meteor.direction[2] * radialVelocity,
          ];
          const radialAcceleration = dotVector3(
            meteor.angularAcceleration,
            meteor.direction,
          );
          meteor.angularAcceleration = [
            meteor.angularAcceleration[0] -
              meteor.direction[0] * radialAcceleration,
            meteor.angularAcceleration[1] -
              meteor.direction[1] * radialAcceleration,
            meteor.angularAcceleration[2] -
              meteor.direction[2] * radialAcceleration,
          ];
          if (now - meteor.lastSample > 0.0075) {
            const firstFlare = Math.exp(
              -Math.pow((age - meteor.flareAt) / meteor.flareWidth, 2),
            );
            const secondFlare = Math.exp(
              -Math.pow(
                (age - meteor.secondFlareAt) /
                  Math.max(0.045, meteor.flareWidth * 0.7),
                2,
              ),
            );
            const grain =
              0.18 +
              0.2 *
                (0.5 +
                  0.5 *
                    temporalNoise(
                      age * 8.5,
                      meteor.seed + 491,
                    ));
            meteor.points.push({
              x: 0,
              y: 0,
              direction: [...meteor.direction] as Vector3,
              born: now,
              energy:
                grain +
                firstFlare * meteor.flareStrength +
                secondFlare * meteor.flareStrength * 0.72,
            });
            meteor.lastSample = now;
          }
          if (age > meteor.duration || meteor.direction[2] < -0.08) {
            meteor.alive = false;
          }
        }

        while (
          meteor.points.length > 2 &&
          now - meteor.points[0].born > meteor.trailLife
        ) {
          meteor.points.shift();
        }
        if (!meteor.alive && meteor.points.length <= 2) {
          meteors.splice(index, 1);
        }
      }
    };

    const render = (timeMilliseconds: number) => {
      const now = timeMilliseconds / 1000;
      const rawDelta = clamp(now - previousTime, 0, 0.05);
      const settingsNow = settingsRef.current;
      const delta = settingsNow.paused ? 0 : rawDelta;
      previousTime = now;
      sidereal = (sidereal + SIDEREAL_RATE * settingsNow.rotationSpeed * delta) % TAU;

      const basis = basisForView(view);
      const focal = height / (2 * Math.tan(view.fov * 0.5));
      drawBackground(basis, focal, settingsNow);
      drawStars(basis, focal, settingsNow, now);
      updateMeteors(delta, now, settingsNow);
      for (const meteor of meteors) {
        const projectedMeteor = projectMeteorForView(
          meteor,
          basis,
          focal,
          width,
          height,
        );
        if (projectedMeteor) {
          drawMeteor(context, projectedMeteor, now);
        }
      }
      drawHorizon(focal);
      drawSensorNoise(settingsNow);

      animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);
    return () => {
      destroyed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      galacticPanorama?.dispose();
      window.removeEventListener("sky:meteor", summonMeteor);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", keyDown);
    };
  }, []);

  return (
    <main className="sky-app">
      <canvas
        ref={canvasRef}
        className="sky-canvas"
        tabIndex={0}
        aria-label={copy.canvasLabel}
      />
      <div className="vignette" />

      <LiquidGlassMenu
        sourceCanvasRef={canvasRef}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        openLabel={copy.openPanel}
        closeLabel={copy.closePanel}
      >
        <div id="sky-controls">
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            catalogCount={catalogCount}
            catalogReady={catalogReady}
            locale={locale}
            onLocaleChange={updateLocale}
          />
        </div>
      </LiquidGlassMenu>
    </main>
  );
}
