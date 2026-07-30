"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

type LiquidGlassMenuProps = {
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openLabel: string;
  closeLabel: string;
  children: ReactNode;
};

type SpringTransition = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
  velocity: number;
  restSpeed: number;
  restDelta: number;
};

type EasingTransition = {
  type: "easing";
  duration: number;
  ease: (progress: number) => number;
};

type Transition = SpringTransition | EasingTransition;

type AnimationChannel = {
  current: number;
  origin: number;
  target: number;
  velocity: number;
  elapsed: number;
  transition: Transition;
};

type MenuGeometry = {
  menuCenterX: number;
  menuCenterY: number;
  menuWidth: number;
  menuHeight: number;
  menuRadius: number;
  menuBlend: number;
  buttonX: number;
  buttonY: number;
  contentScale: number;
  contentBlur: number;
  contentOpacity: number;
  buttonScale: number;
  buttonOpacity: number;
};

const BUTTON_SIZE = 50;
const CLOSED_MENU_SIZE = 40;
const CLOSED_MENU_RADIUS = 130;
const CLOSED_MENU_CONTENT_BLUR = 8;
const CLOSED_MENU_CONTENT_SCALE = 2;
const MENU_WIDTH = 400;
const MENU_MAX_HEIGHT = 680;
const OPEN_MENU_RADIUS = 40;
const OPEN_MENU_CONTENT_BLUR = 0;
const BUTTON_HOVER_SCALE = 1.08;
const BUTTON_PRESS_SCALE = 0.94;
const BUTTON_OPEN_SCALE = 0.5;
const STAGE_PADDING = 20;
const MOBILE_MENU_INSET = 14;
const TRIGGER_IDLE_TIMEOUT = 2000;

const GLASS_SPACING = 37;
const GLASS_BEZEL_WIDTH = 70;
const GLASS_THICKNESS = 40;
const GLASS_BLUR = 20;
const GLASS_TINT_RED = 40 / 255;
const GLASS_TINT_GREEN = 40 / 255;
const GLASS_TINT_BLUE = 40 / 255;
const GLASS_TINT_ALPHA = 0.4;
const GLASS_SHADOW_ALPHA = 0.14;
const GLASS_SHADOW_OFFSET_Y = 18;
const GLASS_SHADOW_BLUR = 46;
const GLASS_SPECULAR_OPACITY = 0.7;
const GLASS_DISPLACEMENT_BLUR = 20;

function spring(
  options: Partial<Omit<SpringTransition, "type">>,
): SpringTransition {
  return {
    type: "spring",
    stiffness: 300,
    damping: 30,
    mass: 1,
    velocity: 0,
    restSpeed: 0.01,
    restDelta: 0.01,
    ...options,
  };
}

function cubicBezierCoordinate(t: number, p1: number, p2: number) {
  const inverse = 1 - t;
  return (
    3 * inverse * inverse * t * p1 +
    3 * inverse * t * t * p2 +
    t * t * t
  );
}

function cubicBezierDerivative(t: number, p1: number, p2: number) {
  const inverse = 1 - t;
  return (
    3 * inverse * inverse * p1 +
    6 * inverse * t * (p2 - p1) +
    3 * t * t * (1 - p2)
  );
}

const Easing = {
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  bezier:
    (x1: number, y1: number, x2: number, y2: number) =>
    (progress: number) => {
      const x = Math.min(1, Math.max(0, progress));
      if (x === 0 || x === 1) return x;
      const clampedX1 = Math.min(1, Math.max(0, x1));
      const clampedX2 = Math.min(1, Math.max(0, x2));
      let t = x;
      let solved = false;
      for (let index = 0; index < 8; index += 1) {
        const current =
          cubicBezierCoordinate(t, clampedX1, clampedX2) - x;
        const derivative = cubicBezierDerivative(t, clampedX1, clampedX2);
        if (Math.abs(current) < 1e-6) {
          solved = true;
          break;
        }
        if (Math.abs(derivative) < 1e-6) break;
        const next = t - current / derivative;
        if (next < 0 || next > 1) break;
        t = next;
      }
      if (!solved) {
        let lower = 0;
        let upper = 1;
        t = x;
        for (let index = 0; index < 16; index += 1) {
          const current = cubicBezierCoordinate(t, clampedX1, clampedX2);
          if (Math.abs(current - x) < 1e-6) break;
          if (current < x) lower = t;
          else upper = t;
          t = (lower + upper) / 2;
        }
      }
      return cubicBezierCoordinate(t, y1, y2);
    },
};

function easing(
  duration: number,
  ease: (progress: number) => number,
): EasingTransition {
  return { type: "easing", duration, ease };
}

// These values are copied from liquid-dom's MenuDemo.tsx.
const BUTTON_OPEN_POSITION_TRANSITION = spring({
  stiffness: 499,
  damping: 22,
});
const BUTTON_CLOSE_POSITION_TRANSITION = spring({
  stiffness: 90,
  damping: 20,
  velocity: 2400,
});
const BUTTON_SCALE_TRANSITION = spring({
  stiffness: 155,
  damping: 24,
});
const BUTTON_CONTENT_OPEN_TRANSITION = easing(0.01, Easing.easeOut);
const BUTTON_CONTENT_CLOSE_TRANSITION = easing(0.15, Easing.easeIn);
const MENU_OPEN_POSITION_TRANSITION = spring({
  stiffness: 144,
  damping: 14,
  velocity: 2400,
});
const MENU_OPEN_SIZE_TRANSITION = easing(
  0.3,
  Easing.bezier(0.8, 0.3, 0.5, 0.8),
);
const MENU_CLOSE_POSITION_TRANSITION = spring({
  stiffness: 130,
  damping: 18,
});
const MENU_CLOSE_SIZE_TRANSITION = easing(0.25, Easing.easeOut);
const MENU_CLOSE_HEIGHT_TRANSITION = easing(0.18, Easing.easeOut);
const MENU_OPEN_RADIUS_TRANSITION = easing(0.7, Easing.easeOut);
const MENU_CLOSE_RADIUS_TRANSITION = easing(0.7, Easing.easeOut);
const CONTENT_TRANSITION = spring({
  stiffness: 137,
  damping: 20,
});
const CONTENT_BLUR_TRANSITION = easing(0.3, Easing.easeOut);
const CONTENT_CLOSE_TRANSITION = easing(0.12, Easing.easeOut);
const CONTENT_OPACITY_CLOSE_TRANSITION = easing(0.08, Easing.easeOut);
const TRIGGER_VISIBILITY_TRANSITION = easing(0.18, Easing.easeOut);

function createChannel(value: number, transition: Transition): AnimationChannel {
  return {
    current: value,
    origin: value,
    target: value,
    velocity: 0,
    elapsed: 0,
    transition,
  };
}

function setChannelTarget(
  channel: AnimationChannel,
  target: number,
  transition: Transition,
  reducedMotion: boolean,
) {
  channel.origin = channel.current;
  channel.target = target;
  channel.elapsed = 0;
  channel.transition = transition;
  channel.velocity =
    transition.type === "spring" &&
    transition.velocity !== 0 &&
    channel.current !== target
      ? Math.abs(transition.velocity) * Math.sign(target - channel.current)
      : 0;
  if (reducedMotion) {
    channel.current = target;
    channel.origin = target;
    channel.velocity = 0;
  }
}

function syncChannelToLayout(
  channel: AnimationChannel,
  value: number,
) {
  channel.current = value;
  channel.origin = value;
  channel.target = value;
  channel.velocity = 0;
  channel.elapsed = 0;
}

function stepChannel(channel: AnimationChannel, deltaSeconds: number) {
  const transition = channel.transition;
  if (transition.type === "spring") {
    const springDelta = Math.min(0.064, Math.max(0, deltaSeconds));
    const stepCount = Math.max(1, Math.ceil(springDelta / (1 / 60)));
    const stepSeconds = springDelta / stepCount;
    for (let index = 0; index < stepCount; index += 1) {
      const displacement = channel.current - channel.target;
      const springForce = -transition.stiffness * displacement;
      const dampingForce = -transition.damping * channel.velocity;
      const acceleration =
        (springForce + dampingForce) / transition.mass;
      channel.velocity += acceleration * stepSeconds;
      channel.current += channel.velocity * stepSeconds;
    }
    if (
      Math.abs(channel.velocity) <= transition.restSpeed &&
      Math.abs(channel.target - channel.current) <= transition.restDelta
    ) {
      channel.current = channel.target;
      channel.velocity = 0;
    }
    return;
  }

  channel.elapsed += Math.max(0, deltaSeconds);
  const progress = Math.min(1, channel.elapsed / transition.duration);
  channel.current =
    channel.origin +
    (channel.target - channel.origin) * transition.ease(progress);
}

function targetGeometry(
  open: boolean,
  viewportWidth: number,
  viewportHeight: number,
  contentHeight: number,
) {
  const mobile = viewportWidth <= 720;
  const menuWidth = mobile
    ? viewportWidth - MOBILE_MENU_INSET * 2
    : Math.min(MENU_WIDTH, viewportWidth - STAGE_PADDING * 2);
  const maximumMenuHeight = mobile
    ? viewportHeight * 0.5
    : Math.min(MENU_MAX_HEIGHT, viewportHeight - STAGE_PADDING * 2);
  const menuHeight = Math.min(
    maximumMenuHeight,
    Math.max(CLOSED_MENU_SIZE, Math.ceil(contentHeight)),
  );
  const openMenuLeft = mobile
    ? MOBILE_MENU_INSET
    : viewportWidth - STAGE_PADDING - menuWidth;
  const openMenuTop = mobile
    ? viewportHeight - MOBILE_MENU_INSET - menuHeight
    : viewportHeight - STAGE_PADDING - menuHeight;
  const buttonInset = mobile ? MOBILE_MENU_INSET : STAGE_PADDING;
  const closedButtonX = viewportWidth - buttonInset - BUTTON_SIZE;
  const closedButtonY = viewportHeight - buttonInset - BUTTON_SIZE;
  const closedCenterX = closedButtonX + BUTTON_SIZE / 2;
  const closedCenterY = closedButtonY + BUTTON_SIZE / 2;

  return {
    menuCenterX: open ? openMenuLeft + menuWidth / 2 : closedCenterX,
    menuCenterY: open ? openMenuTop + menuHeight / 2 : closedCenterY,
    menuWidth: open ? menuWidth : CLOSED_MENU_SIZE,
    menuHeight: open ? menuHeight : CLOSED_MENU_SIZE,
    menuRadius: open ? OPEN_MENU_RADIUS : CLOSED_MENU_RADIUS,
    menuBlend: open ? 1 : 0,
    buttonX: open
      ? openMenuLeft + menuWidth / 2 - BUTTON_SIZE / 2
      : closedButtonX,
    buttonY: open
      ? openMenuTop + menuHeight / 2 - BUTTON_SIZE / 2
      : closedButtonY,
    contentScale: open ? 1 : CLOSED_MENU_CONTENT_SCALE,
    contentBlur: open
      ? OPEN_MENU_CONTENT_BLUR
      : CLOSED_MENU_CONTENT_BLUR,
    contentOpacity: open ? 1 : 0,
    buttonScale: open ? BUTTON_OPEN_SCALE : 1,
    buttonOpacity: open ? 0 : 1,
    openMenuWidth: menuWidth,
    openMenuHeight: menuHeight,
  };
}

function createGeometryChannels(
  geometry: ReturnType<typeof targetGeometry>,
) {
  return {
    menuCenterX: createChannel(
      geometry.menuCenterX,
      MENU_CLOSE_POSITION_TRANSITION,
    ),
    menuCenterY: createChannel(
      geometry.menuCenterY,
      MENU_CLOSE_POSITION_TRANSITION,
    ),
    menuWidth: createChannel(
      geometry.menuWidth,
      MENU_CLOSE_SIZE_TRANSITION,
    ),
    menuHeight: createChannel(
      geometry.menuHeight,
      MENU_CLOSE_SIZE_TRANSITION,
    ),
    menuRadius: createChannel(
      geometry.menuRadius,
      MENU_CLOSE_RADIUS_TRANSITION,
    ),
    menuBlend: createChannel(
      geometry.menuBlend,
      MENU_CLOSE_SIZE_TRANSITION,
    ),
    buttonX: createChannel(
      geometry.buttonX,
      BUTTON_CLOSE_POSITION_TRANSITION,
    ),
    buttonY: createChannel(
      geometry.buttonY,
      BUTTON_CLOSE_POSITION_TRANSITION,
    ),
    contentScale: createChannel(
      geometry.contentScale,
      CONTENT_BLUR_TRANSITION,
    ),
    contentBlur: createChannel(
      geometry.contentBlur,
      CONTENT_BLUR_TRANSITION,
    ),
    contentOpacity: createChannel(
      geometry.contentOpacity,
      CONTENT_TRANSITION,
    ),
    buttonScale: createChannel(
      geometry.buttonScale,
      BUTTON_SCALE_TRANSITION,
    ),
    buttonOpacity: createChannel(
      geometry.buttonOpacity,
      BUTTON_CONTENT_CLOSE_TRANSITION,
    ),
  };
}

const LIQUID_GLASS_VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 v_uv;

void main() {
  vec2 position = gl_VertexID == 0
    ? vec2(-1.0, -1.0)
    : gl_VertexID == 1
      ? vec2(3.0, -1.0)
      : vec2(-1.0, 3.0);
  v_uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// GLSL port of the shape/profile/refraction/reflection/specular structure used
// by AndrewPrifer/liquid-dom's GLASS_SHADER. Numeric uniforms below are set to
// the exact GlassContainer values from MenuDemo.tsx.
const LIQUID_GLASS_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_backdrop;
uniform vec2 u_resolution;
uniform vec4 u_menu_rect;
uniform vec4 u_button_rect;
uniform float u_menu_radius;
uniform float u_menu_blend;
uniform vec4 u_glass_primary;
uniform vec4 u_glass_secondary;
uniform vec4 u_glass_tint;
uniform float u_glass_shadow_opacity;
uniform float u_trigger_visibility;

in vec2 v_uv;
out vec4 out_color;

const float SDF_EPSILON = 0.0001;
const float SDF_SMOOTH_UNION_DEPTH = 0.25;
const float SDF_NORMAL_ANGLE_INV_PI = 0.3183098861837907;
const float SMOOTH_UNION_ACCELERATION = 0.35;
const float CORNER_SMOOTHING = 0.6;
const float CORNER_EXPONENT = 4.0;
const float GLASS_IOR = 1.5;
const float GLASS_DISPERSION = 0.0;
const float SPECULAR_STRENGTH = 1.0;
const float SPECULAR_WIDTH = 1.0;
const float SPECULAR_FALLOFF = 1.0;
const float OPPOSITE_SPECULAR_STRENGTH = 1.0;
const float SPECULAR_SHARPNESS = 2.0;
const float REFLECTION_OFFSET = 18.0;

float superellipse_length(vec2 value, float exponent) {
  vec2 absolute_value = abs(value);
  return pow(
    pow(absolute_value.x, exponent) + pow(absolute_value.y, exponent),
    1.0 / exponent
  );
}

float sd_smooth_round_rect(vec2 position, vec4 rectangle, float radius) {
  vec2 half_size = max(rectangle.zw * 0.5, vec2(1.0));
  vec2 local_position = position - rectangle.xy - half_size;
  float corner_limit = min(half_size.x, half_size.y);
  float clamped_radius = min(max(radius, 0.0), corner_limit);
  vec2 q = abs(local_position) - half_size + vec2(clamped_radius);
  float corner_distance =
    superellipse_length(max(q, vec2(0.0)), CORNER_EXPONENT);
  return corner_distance + min(max(q.x, q.y), 0.0) - clamped_radius;
}

float sd_circle(vec2 position, vec4 rectangle) {
  vec2 center = rectangle.xy + rectangle.zw * 0.5;
  return length(position - center) - rectangle.z * 0.5;
}

vec2 shape_gradient(vec2 position, vec4 rectangle, float radius) {
  float epsilon = 1.0;
  vec2 delta = vec2(
    sd_smooth_round_rect(position + vec2(epsilon, 0.0), rectangle, radius) -
      sd_smooth_round_rect(position - vec2(epsilon, 0.0), rectangle, radius),
    sd_smooth_round_rect(position + vec2(0.0, epsilon), rectangle, radius) -
      sd_smooth_round_rect(position - vec2(0.0, epsilon), rectangle, radius)
  );
  float magnitude = length(delta);
  return magnitude < SDF_EPSILON ? vec2(0.0, -1.0) : delta / magnitude;
}

vec2 circle_gradient(vec2 position, vec4 rectangle) {
  vec2 center = rectangle.xy + rectangle.zw * 0.5;
  vec2 delta = position - center;
  float magnitude = length(delta);
  return magnitude < SDF_EPSILON ? vec2(0.0, -1.0) : delta / magnitude;
}

float normal_angle_gate(float value) {
  float x = clamp(value, 0.0, 1.0);
  return clamp(x + x * x - x * x * x, 0.0, 1.0);
}

float conservative_smooth_union(
  float left_distance,
  float right_distance,
  float blend_distance
) {
  float k = max(blend_distance, SDF_EPSILON);
  float progress =
    clamp(1.0 - abs(left_distance - right_distance) / k, 0.0, 1.0);
  if (progress <= SDF_EPSILON) {
    return min(left_distance, right_distance);
  }
  float inverse_progress = 1.0 - progress;
  float remapped_progress = clamp(
    progress -
      SMOOTH_UNION_ACCELERATION *
      progress *
      inverse_progress *
      inverse_progress,
    0.0,
    1.0
  );
  float correction =
    k * SDF_SMOOTH_UNION_DEPTH * remapped_progress * remapped_progress;
  return min(left_distance, right_distance) - correction;
}

float scene_distance(vec2 position) {
  float menu_distance =
    sd_smooth_round_rect(position, u_menu_rect, u_menu_radius);
  float button_distance = sd_circle(position, u_button_rect);
  vec2 menu_gradient =
    shape_gradient(position, u_menu_rect, u_menu_radius);
  vec2 button_gradient = circle_gradient(position, u_button_rect);
  float alignment = clamp(dot(menu_gradient, button_gradient), -1.0, 1.0);
  float normalized_angle = acos(alignment) * SDF_NORMAL_ANGLE_INV_PI;
  float normal_gate = normal_angle_gate(normalized_angle);
  return conservative_smooth_union(
    menu_distance,
    button_distance,
    u_glass_primary.x *
      normal_gate *
      clamp(u_menu_blend, 0.0, 1.0)
  );
}

vec2 scene_gradient(vec2 position) {
  float epsilon = max(1.0, u_glass_secondary.x * 0.1);
  vec2 delta = vec2(
    scene_distance(position + vec2(epsilon, 0.0)) -
      scene_distance(position - vec2(epsilon, 0.0)),
    scene_distance(position + vec2(0.0, epsilon)) -
      scene_distance(position - vec2(0.0, epsilon))
  );
  float magnitude = length(delta);
  return magnitude < SDF_EPSILON ? vec2(0.0, -1.0) : delta / magnitude;
}

vec2 convex_squircle(float x) {
  float u = 1.0 - clamp(x, 0.0, 1.0);
  float inside = max(1.0 - pow(u, 4.0), 0.0001);
  float height = sqrt(inside);
  float derivative = 2.0 * pow(u, 3.0) / sqrt(inside);
  return vec2(height, derivative);
}

vec3 sample_blurred_backdrop(vec2 uv) {
  vec2 texel = u_glass_primary.w / u_resolution;
  vec3 color =
    texture(u_backdrop, clamp(uv, vec2(0.0), vec2(1.0))).rgb * 0.28;
  color +=
    texture(u_backdrop, clamp(uv + texel * vec2(-0.7, 0.0), vec2(0.0), vec2(1.0))).rgb * 0.12;
  color +=
    texture(u_backdrop, clamp(uv + texel * vec2(0.7, 0.0), vec2(0.0), vec2(1.0))).rgb * 0.12;
  color +=
    texture(u_backdrop, clamp(uv + texel * vec2(0.0, -0.7), vec2(0.0), vec2(1.0))).rgb * 0.12;
  color +=
    texture(u_backdrop, clamp(uv + texel * vec2(0.0, 0.7), vec2(0.0), vec2(1.0))).rgb * 0.12;
  color +=
    texture(u_backdrop, clamp(uv + texel * vec2(-0.48, -0.48), vec2(0.0), vec2(1.0))).rgb * 0.06;
  color +=
    texture(u_backdrop, clamp(uv + texel * vec2(0.48, -0.48), vec2(0.0), vec2(1.0))).rgb * 0.06;
  color +=
    texture(u_backdrop, clamp(uv + texel * vec2(-0.48, 0.48), vec2(0.0), vec2(1.0))).rgb * 0.06;
  color +=
    texture(u_backdrop, clamp(uv + texel * vec2(0.48, 0.48), vec2(0.0), vec2(1.0))).rgb * 0.06;
  return color;
}

float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 position = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  float distance = scene_distance(position);
  float surface_visibility = mix(
    u_trigger_visibility,
    1.0,
    clamp(u_menu_blend, 0.0, 1.0)
  );
  if (surface_visibility <= 0.001) {
    discard;
  }

  vec2 shadow_position =
    position - vec2(0.0, u_glass_secondary.z);
  float shadow_distance = max(scene_distance(shadow_position), 0.0);
  float shadow = exp(
    -(shadow_distance * shadow_distance) /
      (2.0 * u_glass_secondary.w * u_glass_secondary.w)
  );
  if (distance > u_glass_secondary.w * 2.5) {
    discard;
  }

  float fill_mask = 1.0 - smoothstep(0.0, 1.4, distance);
  if (fill_mask <= 0.001) {
    out_color = vec4(
      0.0,
      0.0,
      0.0,
      shadow * u_glass_shadow_opacity * surface_visibility
    );
    return;
  }

  vec2 gradient_top_left = scene_gradient(position);
  vec2 rim_normal = vec2(gradient_top_left.x, -gradient_top_left.y);
  float inward_distance = max(-distance, 0.0);
  float bezel_width = max(u_glass_primary.y, 2.0);
  float bezel_progress =
    clamp(inward_distance / bezel_width, 0.0, 1.0);
  vec2 profile = convex_squircle(bezel_progress);
  float surface_height =
    u_glass_primary.z +
    (inward_distance > bezel_width ? bezel_width : profile.x * bezel_width);
  float clamped_slope = min(profile.y, tan(1.4835298));
  vec3 surface_normal =
    normalize(vec3(rim_normal * clamped_slope, 1.0));

  vec3 incident = vec3(0.0, 0.0, -1.0);
  vec3 refracted_ray =
    refract(incident, surface_normal, 1.0 / GLASS_IOR);
  vec2 displacement =
    refracted_ray.xy /
    max(-refracted_ray.z, 0.0001) *
    surface_height;
  vec2 refracted_uv = v_uv + displacement / u_resolution;
  vec3 refracted_color = sample_blurred_backdrop(refracted_uv);

  vec2 reflected_uv =
    v_uv + rim_normal * REFLECTION_OFFSET / u_resolution;
  vec3 reflected_color = sample_blurred_backdrop(reflected_uv);
  vec3 glass = mix(
    refracted_color,
    u_glass_tint.rgb,
    u_glass_tint.a
  );
  float reflected_luma = luminance(reflected_color);
  float refracted_luma = luminance(refracted_color);
  float reflection_presence =
    smoothstep(0.2, 0.85, reflected_luma);
  float refraction_acceptance =
    1.0 - smoothstep(0.35, 0.85, refracted_luma);
  float reflection_blend =
    reflection_presence * refraction_acceptance;
  vec3 edge_specular_color =
    mix(refracted_color, reflected_color, reflection_blend);

  float specular_inward_distance = inward_distance;
  float specular_outer_mask =
    1.0 - smoothstep(0.0, 1.0, distance);
  float specular_inner_mask =
    1.0 - smoothstep(
      SPECULAR_WIDTH,
      SPECULAR_WIDTH + 1.0,
      specular_inward_distance
    );
  float rim_band_mask =
    specular_outer_mask * specular_inner_mask;
  vec2 light_direction =
    normalize(vec2(sin(-0.7853981634), -cos(-0.7853981634)));
  float band_progress =
    clamp(specular_inward_distance / SPECULAR_WIDTH, 0.0, 1.0);
  float primary_strength =
    SPECULAR_STRENGTH -
    SPECULAR_FALLOFF * band_progress * band_progress;
  float opposite_strength =
    OPPOSITE_SPECULAR_STRENGTH -
    SPECULAR_FALLOFF * band_progress * band_progress;
  float rim_specular =
    pow(max(dot(rim_normal, light_direction), 0.0), SPECULAR_SHARPNESS);
  float mirrored_specular =
    pow(max(dot(rim_normal, -light_direction), 0.0), SPECULAR_SHARPNESS);
  float combined_specular = clamp(
    rim_specular * primary_strength * rim_band_mask +
      mirrored_specular * opposite_strength * rim_band_mask,
    0.0,
    1.0
  );
  float white_specular_opacity =
    combined_specular * u_glass_secondary.y;

  vec3 color = mix(glass, edge_specular_color, combined_specular);
  color += vec3(1.0) * white_specular_opacity;
  out_color = vec4(color, fill_mask * surface_visibility);
}
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    LIQUID_GLASS_VERTEX_SHADER,
  );
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    LIQUID_GLASS_FRAGMENT_SHADER,
  );
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function LiquidGlassMenu({
  sourceCanvasRef,
  open,
  onOpenChange,
  openLabel,
  closeLabel,
  children,
}: LiquidGlassMenuProps) {
  const glassCanvasRef = useRef<HTMLCanvasElement>(null);
  const menuClipRef = useRef<HTMLDivElement>(null);
  const menuContentRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  const buttonHoveredRef = useRef(false);
  const buttonPressedRef = useRef(false);
  const retargetButtonScaleRef = useRef<(() => void) | null>(null);
  const [liquidReady, setLiquidReady] = useState(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onOpenChange]);

  useEffect(() => {
    const glassCanvas = glassCanvasRef.current;
    if (!glassCanvas) return;
    const gl = glassCanvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const program = createProgram(gl);
    const vertexArray = gl.createVertexArray();
    const texture = gl.createTexture();
    if (!program || !vertexArray || !texture) return;

    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const menuRectLocation = gl.getUniformLocation(program, "u_menu_rect");
    const buttonRectLocation = gl.getUniformLocation(program, "u_button_rect");
    const menuRadiusLocation = gl.getUniformLocation(
      program,
      "u_menu_radius",
    );
    const menuBlendLocation = gl.getUniformLocation(program, "u_menu_blend");
    const primaryLocation = gl.getUniformLocation(program, "u_glass_primary");
    const secondaryLocation = gl.getUniformLocation(
      program,
      "u_glass_secondary",
    );
    const tintLocation = gl.getUniformLocation(program, "u_glass_tint");
    const shadowOpacityLocation = gl.getUniformLocation(
      program,
      "u_glass_shadow_opacity",
    );
    const triggerVisibilityLocation = gl.getUniformLocation(
      program,
      "u_trigger_visibility",
    );
    const backdropLocation = gl.getUniformLocation(program, "u_backdrop");

    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.uniform1i(backdropLocation, 0);

    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let reducedMotion = reducedMotionQuery.matches;
    const reducedMotionChanged = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };
    reducedMotionQuery.addEventListener("change", reducedMotionChanged);

    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;
    let lastOpen = openRef.current;
    let lastTime = performance.now();
    let frame = 0;
    let textureWidth = 0;
    let textureHeight = 0;
    let lastPointerActivity = performance.now();
    let triggerVisibilityTarget = 1;
    let measuredContentHeight = MENU_MAX_HEIGHT;
    let openDimensions = targetGeometry(
      lastOpen,
      viewportWidth,
      viewportHeight,
      measuredContentHeight,
    );
    const channels = createGeometryChannels(openDimensions);
    const triggerVisibility = createChannel(
      1,
      TRIGGER_VISIBILITY_TRANSITION,
    );

    const markPointerActivity = () => {
      lastPointerActivity = performance.now();
      if (triggerVisibilityTarget === 1) return;
      triggerVisibilityTarget = 1;
      setChannelTarget(
        triggerVisibility,
        1,
        TRIGGER_VISIBILITY_TRANSITION,
        reducedMotion,
      );
    };
    window.addEventListener("pointermove", markPointerActivity, {
      passive: true,
    });
    window.addEventListener("pointerdown", markPointerActivity, {
      passive: true,
    });
    window.addEventListener("click", markPointerActivity, { passive: true });

    const retarget = (nextOpen: boolean) => {
      const geometry = targetGeometry(
        nextOpen,
        viewportWidth,
        viewportHeight,
        measuredContentHeight,
      );
      openDimensions = geometry;
      const menuPositionTransition = nextOpen
        ? MENU_OPEN_POSITION_TRANSITION
        : MENU_CLOSE_POSITION_TRANSITION;
      const menuSizeTransition = nextOpen
        ? MENU_OPEN_SIZE_TRANSITION
        : MENU_CLOSE_SIZE_TRANSITION;
      const menuHeightTransition = nextOpen
        ? MENU_OPEN_SIZE_TRANSITION
        : MENU_CLOSE_HEIGHT_TRANSITION;
      const menuRadiusTransition = nextOpen
        ? MENU_OPEN_RADIUS_TRANSITION
        : MENU_CLOSE_RADIUS_TRANSITION;
      // The upstream renderer keeps both Glass nodes inside one scene graph.
      // Our direct-canvas port must explicitly keep their centers together so
      // the smooth union remains one continuous silhouette.
      const buttonPositionTransition = menuPositionTransition;
      const buttonOpacityTransition = nextOpen
        ? BUTTON_CONTENT_OPEN_TRANSITION
        : BUTTON_CONTENT_CLOSE_TRANSITION;

      setChannelTarget(
        channels.menuCenterX,
        geometry.menuCenterX,
        menuPositionTransition,
        reducedMotion,
      );
      setChannelTarget(
        channels.menuCenterY,
        geometry.menuCenterY,
        menuPositionTransition,
        reducedMotion,
      );
      setChannelTarget(
        channels.menuWidth,
        geometry.menuWidth,
        menuSizeTransition,
        reducedMotion,
      );
      setChannelTarget(
        channels.menuHeight,
        geometry.menuHeight,
        menuHeightTransition,
        reducedMotion,
      );
      setChannelTarget(
        channels.menuRadius,
        geometry.menuRadius,
        menuRadiusTransition,
        reducedMotion,
      );
      setChannelTarget(
        channels.menuBlend,
        geometry.menuBlend,
        menuSizeTransition,
        reducedMotion,
      );
      setChannelTarget(
        channels.buttonX,
        geometry.buttonX,
        buttonPositionTransition,
        reducedMotion,
      );
      setChannelTarget(
        channels.buttonY,
        geometry.buttonY,
        buttonPositionTransition,
        reducedMotion,
      );
      setChannelTarget(
        channels.contentScale,
        geometry.contentScale,
        nextOpen ? CONTENT_BLUR_TRANSITION : CONTENT_CLOSE_TRANSITION,
        reducedMotion,
      );
      setChannelTarget(
        channels.contentBlur,
        geometry.contentBlur,
        nextOpen ? CONTENT_BLUR_TRANSITION : CONTENT_CLOSE_TRANSITION,
        reducedMotion,
      );
      setChannelTarget(
        channels.contentOpacity,
        geometry.contentOpacity,
        nextOpen ? CONTENT_TRANSITION : CONTENT_OPACITY_CLOSE_TRANSITION,
        reducedMotion,
      );
      setChannelTarget(
        channels.buttonScale,
        geometry.buttonScale,
        BUTTON_SCALE_TRANSITION,
        reducedMotion,
      );
      setChannelTarget(
        channels.buttonOpacity,
        geometry.buttonOpacity,
        buttonOpacityTransition,
        reducedMotion,
      );
    };

    const contentRoot = menuContentRef.current?.firstElementChild;
    const measureContent = () => {
      if (!(contentRoot instanceof HTMLElement)) return;
      const nextContentHeight = Math.ceil(contentRoot.scrollHeight);
      if (
        nextContentHeight <= 0 ||
        Math.abs(nextContentHeight - measuredContentHeight) < 1
      ) {
        return;
      }
      measuredContentHeight = nextContentHeight;
      const geometry = targetGeometry(
        openRef.current,
        viewportWidth,
        viewportHeight,
        measuredContentHeight,
      );
      openDimensions = geometry;
      if (openRef.current) {
        // The Collapse already supplies the visible height transition. Track
        // that live layout value directly instead of restarting the menu-open
        // easing and its high-velocity position spring on every ResizeObserver
        // frame.
        syncChannelToLayout(channels.menuCenterY, geometry.menuCenterY);
        syncChannelToLayout(channels.menuHeight, geometry.menuHeight);
        syncChannelToLayout(channels.buttonY, geometry.buttonY);
      }
    };
    const contentResizeObserver =
      contentRoot instanceof HTMLElement
        ? new ResizeObserver(measureContent)
        : null;
    if (contentRoot instanceof HTMLElement) {
      contentResizeObserver?.observe(contentRoot);
    }
    const measurementFrame = window.requestAnimationFrame(measureContent);

    const retargetButtonScale = () => {
      const target = openRef.current
        ? BUTTON_OPEN_SCALE
        : buttonPressedRef.current
          ? BUTTON_PRESS_SCALE
          : buttonHoveredRef.current
            ? BUTTON_HOVER_SCALE
            : 1;
      setChannelTarget(
        channels.buttonScale,
        target,
        BUTTON_SCALE_TRANSITION,
        reducedMotion,
      );
    };
    retargetButtonScaleRef.current = retargetButtonScale;

    const render = (time: number) => {
      const deltaSeconds = Math.max(0, (time - lastTime) / 1000);
      lastTime = time;

      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;
      if (nextWidth !== viewportWidth || nextHeight !== viewportHeight) {
        viewportWidth = nextWidth;
        viewportHeight = nextHeight;
        retarget(openRef.current);
      }
      if (openRef.current !== lastOpen) {
        lastOpen = openRef.current;
        buttonHoveredRef.current = false;
        buttonPressedRef.current = false;
        retarget(lastOpen);
      }
      const shouldHideTrigger =
        !lastOpen &&
        time - lastPointerActivity >= TRIGGER_IDLE_TIMEOUT;
      const nextTriggerVisibilityTarget = shouldHideTrigger ? 0 : 1;
      if (nextTriggerVisibilityTarget !== triggerVisibilityTarget) {
        triggerVisibilityTarget = nextTriggerVisibilityTarget;
        setChannelTarget(
          triggerVisibility,
          triggerVisibilityTarget,
          TRIGGER_VISIBILITY_TRANSITION,
          reducedMotion,
        );
      }

      for (const channel of Object.values(channels)) {
        stepChannel(channel, deltaSeconds);
      }
      stepChannel(triggerVisibility, deltaSeconds);

      const menuLeft =
        channels.menuCenterX.current - channels.menuWidth.current / 2;
      const menuTop =
        channels.menuCenterY.current - channels.menuHeight.current / 2;
      const menuClip = menuClipRef.current;
      const menuContent = menuContentRef.current;
      const button = buttonRef.current;
      if (menuClip && menuContent && button) {
        menuClip.style.left = `${menuLeft}px`;
        menuClip.style.top = `${menuTop}px`;
        menuClip.style.width = `${channels.menuWidth.current}px`;
        menuClip.style.height = `${channels.menuHeight.current}px`;
        menuClip.style.borderRadius = `${channels.menuRadius.current}px`;
        menuClip.style.pointerEvents = lastOpen ? "auto" : "none";
        menuClip.style.opacity = lastOpen
          ? "1"
          : `${triggerVisibility.current}`;

        menuContent.style.width = `${openDimensions.openMenuWidth}px`;
        menuContent.style.height = `${openDimensions.openMenuHeight}px`;
        menuContent.style.opacity = `${channels.contentOpacity.current}`;
        menuContent.style.filter =
          `blur(${channels.contentBlur.current}px)`;
        menuContent.style.transform =
          `translate(-50%, -50%) scale(${channels.contentScale.current})`;

        button.style.left = `${channels.buttonX.current}px`;
        button.style.top = `${channels.buttonY.current}px`;
        button.style.opacity =
          `${channels.buttonOpacity.current * triggerVisibility.current}`;
        button.style.transform =
          `scale(${channels.buttonScale.current})`;
        button.style.pointerEvents =
          lastOpen || triggerVisibility.current <= 0.05 ? "none" : "auto";
      }

      const sourceCanvas = sourceCanvasRef.current;
      const deviceScale = Math.min(1.5, window.devicePixelRatio || 1);
      const targetWidth = Math.max(1, Math.round(viewportWidth * deviceScale));
      const targetHeight = Math.max(1, Math.round(viewportHeight * deviceScale));
      if (
        glassCanvas.width !== targetWidth ||
        glassCanvas.height !== targetHeight
      ) {
        glassCanvas.width = targetWidth;
        glassCanvas.height = targetHeight;
      }
      gl.viewport(0, 0, glassCanvas.width, glassCanvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (
          textureWidth !== sourceCanvas.width ||
          textureHeight !== sourceCanvas.height
        ) {
          textureWidth = sourceCanvas.width;
          textureHeight = sourceCanvas.height;
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            sourceCanvas,
          );
        } else {
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            sourceCanvas,
          );
        }

        gl.useProgram(program);
        gl.uniform2f(
          resolutionLocation,
          glassCanvas.width,
          glassCanvas.height,
        );
        gl.uniform4f(
          menuRectLocation,
          menuLeft * deviceScale,
          menuTop * deviceScale,
          channels.menuWidth.current * deviceScale,
          channels.menuHeight.current * deviceScale,
        );
        gl.uniform4f(
          buttonRectLocation,
          (channels.buttonX.current +
            (BUTTON_SIZE - BUTTON_SIZE * channels.buttonScale.current) / 2) *
            deviceScale,
          (channels.buttonY.current +
            (BUTTON_SIZE - BUTTON_SIZE * channels.buttonScale.current) / 2) *
            deviceScale,
          BUTTON_SIZE * channels.buttonScale.current * deviceScale,
          BUTTON_SIZE * channels.buttonScale.current * deviceScale,
        );
        gl.uniform1f(
          menuRadiusLocation,
          channels.menuRadius.current * deviceScale,
        );
        gl.uniform1f(menuBlendLocation, channels.menuBlend.current);
        gl.uniform4f(
          primaryLocation,
          GLASS_SPACING * deviceScale,
          GLASS_BEZEL_WIDTH * deviceScale,
          GLASS_THICKNESS * deviceScale,
          GLASS_BLUR * deviceScale,
        );
        gl.uniform4f(
          secondaryLocation,
          GLASS_DISPLACEMENT_BLUR * deviceScale,
          GLASS_SPECULAR_OPACITY,
          GLASS_SHADOW_OFFSET_Y * deviceScale,
          GLASS_SHADOW_BLUR * deviceScale,
        );
        gl.uniform4f(
          tintLocation,
          GLASS_TINT_RED,
          GLASS_TINT_GREEN,
          GLASS_TINT_BLUE,
          GLASS_TINT_ALPHA,
        );
        gl.uniform1f(
          shadowOpacityLocation,
          GLASS_SHADOW_ALPHA,
        );
        gl.uniform1f(
          triggerVisibilityLocation,
          triggerVisibility.current,
        );
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      frame = window.requestAnimationFrame(render);
    };

    setLiquidReady(true);
    frame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(measurementFrame);
      contentResizeObserver?.disconnect();
      window.removeEventListener("pointermove", markPointerActivity);
      window.removeEventListener("pointerdown", markPointerActivity);
      window.removeEventListener("click", markPointerActivity);
      reducedMotionQuery.removeEventListener("change", reducedMotionChanged);
      retargetButtonScaleRef.current = null;
      gl.deleteTexture(texture);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
    };
  }, [sourceCanvasRef]);

  return (
    <>
      <canvas
        ref={glassCanvasRef}
        className="liquid-glass-layer"
        aria-hidden="true"
      />
      <div
        className={`glass-dismiss-layer${open ? " active" : ""}`}
        onPointerDown={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="liquid-menu-stage" data-liquid-ready={liquidReady}>
        <div ref={menuClipRef} className="liquid-menu-clip">
          <div className="liquid-glass-fallback" aria-hidden="true" />
          <div ref={menuContentRef} className="liquid-menu-content">
            {children}
          </div>
        </div>
        <button
          ref={buttonRef}
          className="liquid-menu-toggle"
          type="button"
          aria-label={open ? closeLabel : openLabel}
          aria-expanded={open}
          aria-controls="sky-controls"
          onClick={() => onOpenChange(true)}
          onPointerEnter={() => {
            buttonHoveredRef.current = true;
            retargetButtonScaleRef.current?.();
          }}
          onPointerLeave={() => {
            buttonHoveredRef.current = false;
            buttonPressedRef.current = false;
            retargetButtonScaleRef.current?.();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            buttonPressedRef.current = true;
            retargetButtonScaleRef.current?.();
          }}
          onPointerUp={() => {
            buttonPressedRef.current = false;
            retargetButtonScaleRef.current?.();
          }}
        >
          <span className="button-content" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>
    </>
  );
}
