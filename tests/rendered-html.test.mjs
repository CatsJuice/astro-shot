import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { computeGlassScissorBounds } from "../app/liquid-glass-geometry.mjs";
import {
  pinchRatio,
  pointerDistance,
} from "../app/pinch-gesture.mjs";
import { createOpeningFireballCue } from "../app/opening-fireball.mjs";
import { resolveInitialLocale } from "../app/locale-preference.mjs";
import {
  firstStarAtOrBelowMagnitude,
  projectCelestial,
  setEquatorialCoordinates,
  setSensorNoiseCrop,
} from "../app/rendering-helpers.mjs";

async function render() {
  return readFile(new URL("../out/index.html", import.meta.url), "utf8");
}

async function readBuiltStyles(html, basePath) {
  const stylesheetUrls = [
    ...html.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/g),
  ].map((match) => match[1]);
  const styles = await Promise.all(
    stylesheetUrls.map((stylesheetUrl) => {
      const pathname = new URL(
        stylesheetUrl,
        "https://astroshot.test",
      ).pathname;
      const unprefixed =
        basePath && pathname.startsWith(`${basePath}/`)
          ? pathname.slice(basePath.length)
          : pathname;
      const relativePath = decodeURIComponent(unprefixed).replace(/^\/+/, "");
      return readFile(
        new URL(`../out/${relativePath}`, import.meta.url),
        "utf8",
      );
    }),
  );
  return styles.join("\n");
}

test("static export renders the AstroShot shell and controls", async () => {
  const html = await render();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const builtStyles = await readBuiltStyles(html, basePath);
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002"
  ).replace(/\/$/, "");

  assert.match(html, /<html lang="en">/i);
  assert.match(html, /<title>AstroShot · Real Sky &amp; Meteor Simulator<\/title>/i);
  assert.match(html, new RegExp(`(?:href|src)="${basePath}/_next/static/`));
  assert.ok(html.includes(`content="${siteUrl}/og.png"`));
  if (basePath) {
    assert.ok(!html.includes(`${basePath}${basePath}/og.png`));
  }
  assert.match(html, /aria-label="Draggable real-sky simulation canvas"/);
  assert.match(html, /HYG v4\.1 · HIPPARCOS \/ YALE \/ GLIESE/);
  assert.match(html, /aria-label="Atmospheric twinkle"/);
  assert.match(html, /aria-label="Base speed"/);
  assert.match(html, /aria-label="Ordinary meteor and fireball ratio"/);
  assert.match(html, /aria-valuetext="Ordinary 74%, Fireball 26%"/);
  assert.match(html, /aria-label="Ignition time"/);
  assert.match(html, /aria-label="Flare probability"/);
  assert.match(html, /aria-label="Flare position"/);
  assert.match(html, /aria-label="Direction spread"/);
  assert.match(html, /Trigger ordinary meteor/);
  assert.match(html, /Trigger weak fireball/);
  assert.match(html, /Trigger strong fireball/);
  assert.match(html, /Simulate high-ISO sensor grain/);
  assert.match(html, /aria-label="Open settings"/);
  assert.match(html, /aria-label="Enter camera mode"/);
  assert.match(html, />Long exposure</);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Switch to Chinese"/);
  assert.match(
    html,
    /href="https:\/\/github\.com\/CatsJuice\/astro-shot"[^>]*aria-label="View project on GitHub"/,
  );
  assert.doesNotMatch(html, />LIVE</);
  assert.doesNotMatch(html, /夜航|NIGHTFALL|拖拽观察天穹| FPS/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
  assert.doesNotMatch(
    `${html}\n${builtStyles}`,
    /Geist Mono|geist_mono|font-geist-mono/i,
  );

  await access(new URL("../out/.nojekyll", import.meta.url));
});

test("optimized star projection matches the reference coordinate system", () => {
  const width = 1920;
  const height = 1080;
  const focal = 960;
  const actual = { x: 0, y: 0, altitude: 0, depth: 0 };
  const star = {
    equatorialX: 0,
    equatorialY: 0,
    equatorialZ: 0,
  };
  const views = [
    [0, 0],
    [2.2, 0.4],
    [5.8, -0.1],
  ];

  for (const rightAscension of [0, 0.7, 2.5, 5.9]) {
    for (const declination of [-1.1, -0.2, 0.8]) {
      setEquatorialCoordinates(star, rightAscension, declination);
      for (const sidereal of [0, 0.9, 4.8]) {
        for (const latitude of [-1, 0, 0.9]) {
          for (const [azimuth, altitude] of views) {
            const sinAzimuth = Math.sin(azimuth);
            const cosAzimuth = Math.cos(azimuth);
            const sinAltitude = Math.sin(altitude);
            const cosAltitude = Math.cos(altitude);
            const basis = {
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

            const hourAngle = sidereal - rightAscension;
            const sinDeclination = Math.sin(declination);
            const cosDeclination = Math.cos(declination);
            const referenceLocal = [
              -cosDeclination * Math.sin(hourAngle),
              sinDeclination * Math.cos(latitude) -
                cosDeclination * Math.cos(hourAngle) * Math.sin(latitude),
              sinDeclination * Math.sin(latitude) +
                cosDeclination * Math.cos(hourAngle) * Math.cos(latitude),
            ];
            const referenceCameraX =
              referenceLocal[0] * basis.right[0] +
              referenceLocal[1] * basis.right[1] +
              referenceLocal[2] * basis.right[2];
            const referenceCameraY =
              referenceLocal[0] * basis.up[0] +
              referenceLocal[1] * basis.up[1] +
              referenceLocal[2] * basis.up[2];
            const referenceCameraZ =
              referenceLocal[0] * basis.forward[0] +
              referenceLocal[1] * basis.forward[1] +
              referenceLocal[2] * basis.forward[2];
            const referenceVisible = referenceCameraZ > 0.08;

            const visible = projectCelestial(
              star,
              Math.sin(sidereal),
              Math.cos(sidereal),
              Math.sin(latitude),
              Math.cos(latitude),
              basis,
              focal,
              width,
              height,
              actual,
            );
            assert.equal(visible, referenceVisible);
            if (!referenceVisible) continue;

            const expected = {
              x: width * 0.5 + (referenceCameraX / referenceCameraZ) * focal,
              y: height * 0.5 - (referenceCameraY / referenceCameraZ) * focal,
              altitude: referenceLocal[2],
              depth: referenceCameraZ,
            };
            for (const key of ["x", "y", "altitude", "depth"]) {
              assert.ok(
                Math.abs(actual[key] - expected[key]) < 1e-8,
                `${key} differs for RA=${rightAscension}, dec=${declination}`,
              );
            }
          }
        }
      }
    }
  }
});

test("magnitude cutoff preserves descending catalog boundaries", () => {
  const stars = [7.5, 7, 7, 4, -1].map((magnitude) => ({ magnitude }));
  for (const [visibleMagnitude, expectedIndex] of [
    [8, 0],
    [7.5, 0],
    [7.25, 1],
    [7, 1],
    [6, 3],
    [-1, 4],
    [-2, 5],
  ]) {
    assert.equal(
      firstStarAtOrBelowMagnitude(stars, visibleMagnitude),
      expectedIndex,
    );
  }
});

test("sensor-noise crops are bounded, stable for five frames, and varied", () => {
  for (const [width, height] of [
    [220, 124],
    [292, 148],
    [360, 210],
  ]) {
    const uniqueCrops = new Set();
    for (let sample = 0; sample < 64; sample += 1) {
      const first = { x: 0, y: 0 };
      setSensorNoiseCrop(first, sample * 5 + 1, width, height);
      assert.ok(first.x >= 0 && first.x < width);
      assert.ok(first.y >= 0 && first.y < height);
      uniqueCrops.add(`${first.x},${first.y}`);

      for (let offset = 1; offset < 5; offset += 1) {
        const held = { x: 0, y: 0 };
        setSensorNoiseCrop(
          held,
          sample * 5 + 1 + offset,
          width,
          height,
        );
        assert.deepEqual(held, first);
      }
    }
    assert.ok(
      uniqueCrops.size >= 60,
      `${width}x${height} repeated too many crop windows`,
    );
  }
});

test("liquid-glass scissor bounds union, scale, flip, and clamp", () => {
  assert.deepEqual(
    computeGlassScissorBounds(
      [
        { left: 100, top: 200, width: 50, height: 40 },
        { left: 300, top: 100, width: 20, height: 30 },
      ],
      1000,
      800,
      1,
      10,
    ),
    { x: 90, y: 550, width: 240, height: 160 },
  );
  assert.deepEqual(
    computeGlassScissorBounds(
      [{ left: -5, top: 550, width: 100, height: 100 }],
      1500,
      900,
      1.5,
      20,
    ),
    { x: 0, y: 0, width: 173, height: 105 },
  );
  assert.equal(
    computeGlassScissorBounds(
      [null, { left: 20, top: 30, width: 0, height: 10 }],
      1000,
      800,
      1,
      10,
    ),
    null,
  );
  assert.equal(
    computeGlassScissorBounds(
      [{ left: 1100, top: 20, width: 50, height: 50 }],
      1000,
      800,
      1,
      0,
    ),
    null,
  );
});

test("pinch gestures measure distance and scale in both directions", () => {
  assert.equal(pointerDistance({ x: 10, y: 20 }, { x: 13, y: 24 }), 5);
  assert.equal(pinchRatio(100, 150), 1.5);
  assert.equal(pinchRatio(100, 50), 0.5);
  assert.equal(pinchRatio(0, 50), 1);
});

test("opening fireball stays near center and travels down-right", () => {
  const minimum = createOpeningFireballCue(() => 0);
  const maximum = createOpeningFireballCue(() => 0.999999);

  assert.ok(minimum.delay >= 0.38);
  assert.ok(maximum.delay <= 0.72);
  assert.ok(minimum.angleDegrees >= 25);
  assert.ok(maximum.angleDegrees < 39);
  assert.ok(minimum.originX >= 0.3);
  assert.ok(maximum.originX < 0.42);
  assert.ok(minimum.originY >= 0.26);
  assert.ok(maximum.originY < 0.38);
});

test("compiled locale defaults remain overridable by saved preference", () => {
  assert.equal(resolveInitialLocale(null, "en"), "en");
  assert.equal(resolveInitialLocale(null, "zh-CN"), "zh-CN");
  assert.equal(resolveInitialLocale("en", "zh-CN"), "en");
  assert.equal(resolveInitialLocale("zh-CN", "en"), "zh-CN");
  assert.equal(resolveInitialLocale("invalid", "zh-CN"), "zh-CN");
});

test("XHS build compiles with Chinese as its default locale", async () => {
  const config = await readFile(
    new URL("../vite.xhs.config.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    config,
    /"process\.env\.NEXT_PUBLIC_DEFAULT_LOCALE": JSON\.stringify\("zh-CN"\)/,
  );
});

test("ships a real catalog and the temporal rendering systems", async () => {
  const [
    source,
    glassSource,
    cameraSource,
    css,
    readme,
    catalogText,
    milkyWayPanorama,
  ] = await Promise.all([
    readFile(new URL("../app/SkySimulator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LiquidGlassMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CameraSystem.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../public/data/stars.json", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../public/textures/eso-milky-way-panorama-4096.jpg",
        import.meta.url,
      ),
    ),
  ]);
  const catalog = JSON.parse(catalogText);

  assert.equal(catalog.count, catalog.stars.length);
  assert.ok(
    catalog.stars.every(
      (star, index) =>
        index === 0 || catalog.stars[index - 1][2] >= star[2],
    ),
    "star catalog must remain sorted from dimmest to brightest",
  );
  assert.ok(catalog.count > 30_000);
  assert.ok(milkyWayPanorama.byteLength > 1_000_000);
  assert.match(source, /function temporalNoise\(/);
  assert.match(source, /function createGalacticPanoramaRenderer\(/);
  assert.match(
    source,
    /withBasePath\(\s*"\/textures\/eso-milky-way-panorama-4096\.jpg"/,
  );
  assert.match(source, /fetch\(withBasePath\("\/data\/stars\.json"\)\)/);
  assert.match(source, /u_camera_to_local/);
  assert.match(source, /float band_mask =/);
  assert.match(source, /eso-milky-way-panorama-4096\.jpg/);
  assert.doesNotMatch(source, /function buildMilkyWay\(/);
  assert.doesNotMatch(source, /\.filter\(\(row\) => row\[2\] <= 6\.95\)/);
  assert.match(source, /function drawPointedCapsule\(/);
  assert.match(source, /function drawCapsuleHead\(/);
  assert.match(source, /function drawDirectionalWake\(/);
  assert.match(source, /const energyBand =/);
  assert.match(source, /second\.energy > 1\.3/);
  assert.match(source, /flareWidth/);
  assert.match(source, /variant === "strong"/);
  assert.match(source, /settings\.directionSpread/);
  assert.match(source, /settings\.meteorSpeed/);
  assert.match(source, /ordinaryMeteorRatio: 74/);
  assert.match(source, /1 - settingsNow\.ordinaryMeteorRatio \/ 100/);
  assert.doesNotMatch(source, /ordinaryWeight|fireballWeight/);
  assert.match(source, /const ordinaryEnergy =/);
  assert.match(source, /const ordinarySpeedScale =/);
  assert.match(source, /const ordinaryTrackLength =/);
  assert.match(source, /ordinaryTrackLength \/ Math\.max\(1, speed\)/);
  assert.match(source, /function screenToLocalDirection\(/);
  assert.match(source, /function projectLocalDirection\(/);
  assert.match(source, /setEquatorialCoordinates\(star, row\[0\], row\[1\]\)/);
  assert.match(source, /const projectedStar: ProjectedCelestial/);
  assert.match(source, /defocus: seeded\(index \+ 2771\)/);
  assert.match(source, /const projected = projectCelestial\(/);
  assert.match(source, /function projectMeteorForView\(/);
  assert.match(source, /angularVelocity: Vector3/);
  assert.match(
    source,
    /direction: \[\.\.\.meteor\.direction\] as Vector3/,
  );
  assert.doesNotMatch(source, /meteor\.x \+= meteor\.vx/);
  assert.match(source, /meteor\.strength \* 1\.25/);
  assert.match(source, /starExposure: 3\.2/);
  assert.match(source, /skyBrightness: 0\.67/);
  assert.match(source, /skyHue: 218/);
  assert.match(source, /skySaturation: 0\.4/);
  assert.match(
    source,
    /label=\{copy\.skyHue\}[\s\S]*?min=\{0\}[\s\S]*?max=\{360\}/,
  );
  assert.match(source, /label=\{copy\.skySaturation\}/);
  assert.match(source, /track="hue"/);
  assert.match(source, /track="saturation"/);
  assert.match(source, /trackHue=\{settings\.skyHue\}/);
  assert.match(source, /saturation \* 90/);
  assert.match(source, /saturation \* 100/);
  assert.match(source, /max=\{6\.4\}/);
  assert.match(source, /const exposureGain =/);
  assert.match(source, /settings\.ignitionTime/);
  assert.match(source, /settings\.burstChance/);
  assert.match(source, /settings\.burstPosition/);
  assert.match(source, /type MeteorVariant = "weak" \| "strong" \| null/);
  assert.match(source, /const imageMotion =/);
  assert.match(source, /noiseEnabled/);
  assert.match(source, /setSensorNoiseCrop\(/);
  assert.match(source, /noiseCanvas\.width = noiseSampleWidth \* 2/);
  assert.match(source, /globalCompositeOperation = "lighter"/);
  assert.match(source, /useState\(false\)/);
  assert.match(source, /<LiquidGlassMenu/);
  assert.match(source, /type Locale = "zh-CN" \| "en"/);
  assert.match(source, /AstroShot · Real Sky &amp; Meteor Simulator|AstroShot · Real Sky & Meteor Simulator/);
  assert.match(source, /window\.localStorage\.setItem\("sky-locale"/);
  assert.match(source, /<details className="section">/);
  assert.match(source, /<summary className="section-toggle">/);
  assert.doesNotMatch(source, /section-index/);
  assert.match(glassSource, /LIQUID_GLASS_FRAGMENT_SHADER/);
  assert.match(glassSource, /const shouldDraw =/);
  assert.match(glassSource, /computeGlassScissorBounds\(/);
  assert.match(glassSource, /gl\.enable\(gl\.SCISSOR_TEST\)/);
  assert.match(glassSource, /if \(wasDrawing \|\| resized\)/);
  assert.match(
    glassSource,
    /float distance = scene_distance\(position\);[\s\S]*?distance > u_glass_secondary\.w \* 2\.5[\s\S]*?float surface_visibility = scene_visibility\(position\);/,
  );
  assert.match(glassSource, /sd_smooth_round_rect/);
  assert.match(glassSource, /refract\(incident, surface_normal/);
  assert.match(glassSource, /texSubImage2D/);
  assert.match(glassSource, /onPointerDown=\{\(\) => onOpenChange\(false\)\}/);
  assert.match(glassSource, /const BUTTON_SIZE = 44/);
  assert.match(glassSource, /const CLOSED_MENU_SIZE = 36/);
  assert.match(glassSource, /const float CORNER_EXPONENT = 2\.0/);
  assert.match(glassSource, /return conservative_smooth_union\(/);
  assert.match(glassSource, /const MENU_WIDTH = 400/);
  assert.match(glassSource, /const MENU_MAX_HEIGHT = 680/);
  assert.match(glassSource, /const OPEN_MENU_RADIUS = 40/);
  assert.match(glassSource, /stiffness: 499/);
  assert.match(glassSource, /stiffness: 144/);
  assert.match(glassSource, /Easing\.bezier\(0\.8, 0\.3, 0\.5, 0\.8\)/);
  assert.match(
    glassSource,
    /const MENU_CLOSE_HEIGHT_TRANSITION = easing\(0\.18, Easing\.easeOut\)/,
  );
  assert.match(
    glassSource,
    /const CONTENT_OPACITY_CLOSE_TRANSITION = easing\(0\.08, Easing\.easeOut\)/,
  );
  assert.match(
    glassSource,
    /const buttonPositionTransition = menuPositionTransition/,
  );
  assert.match(glassSource, /const GLASS_SPACING = 37/);
  assert.match(glassSource, /const GLASS_BEZEL_WIDTH = 70/);
  assert.match(glassSource, /const GLASS_THICKNESS = 40/);
  assert.match(glassSource, /const GLASS_BLUR = 20/);
  assert.match(glassSource, /const MOBILE_MENU_INSET = 14/);
  assert.match(glassSource, /const TRIGGER_IDLE_TIMEOUT = 2000/);
  assert.match(glassSource, /TRIGGER_VISIBILITY_TRANSITION = easing\(0\.18/);
  assert.match(glassSource, /window\.addEventListener\("pointermove"/);
  assert.match(glassSource, /window\.addEventListener\("click"/);
  assert.match(glassSource, /u_trigger_visibility/);
  assert.match(glassSource, /viewportHeight \* 0\.5/);
  assert.match(glassSource, /new ResizeObserver\(measureContent\)/);
  assert.match(glassSource, /contentRoot\.scrollHeight/);
  assert.match(glassSource, /function syncChannelToLayout\(/);
  assert.match(
    glassSource,
    /syncChannelToLayout\(channels\.menuHeight, geometry\.menuHeight\)/,
  );
  assert.match(
    glassSource,
    /syncChannelToLayout\(channels\.menuCenterY, geometry\.menuCenterY\)/,
  );
  assert.match(glassSource, /float sd_circle/);
  assert.match(cameraSource, /window\.indexedDB\.open/);
  assert.match(cameraSource, /source\.captureStream\(30\)/);
  assert.match(cameraSource, /new MediaRecorder/);
  assert.match(cameraSource, /globalCompositeOperation =[\s\S]*?"lighten"/);
  assert.match(cameraSource, /startViewTransition/);
  assert.match(cameraSource, /captures\.slice\(0, 3\)/);
  assert.match(cameraSource, /<video[\s\S]*?controls/);
  assert.match(cameraSource, /onWheel=\{handleZoom\}/);
  assert.match(cameraSource, /deleteStoredCapture/);
  assert.match(cameraSource, /downloadSelectedCapture/);
  assert.match(cameraSource, /gallery-info-sheet t-panel-slide/);
  assert.match(cameraSource, /gallery-more-menu t-dropdown/);
  assert.match(cameraSource, /CaptureKindIcon/);
  assert.match(cameraSource, /const hideIdleUi = !active && uiIdle/);
  assert.match(cameraSource, /menuOpen \? " menu-open-hidden" : ""/);
  assert.match(
    source,
    /keepTriggerVisible=\{cameraActive\}/,
  );
  assert.match(css, /\.sky-canvas\s*\{/);
  assert.match(css, /\.camera-mode-trigger/);
  assert.match(css, /\.long-exposure-preview/);
  assert.match(css, /\.gallery-grid/);
  assert.match(css, /\.gallery-kind-badge/);
  assert.match(css, /\.gallery-info-sheet/);
  assert.match(css, /\.gallery-more-menu/);
  assert.doesNotMatch(cameraSource, /gallery-grid-meta/);
  assert.match(css, /\.noise-toggle\.active/);
  assert.match(css, /\.range\.hue-range::/);
  assert.match(css, /\.range\.saturation-range::/);
  assert.match(css, /background: var\(--range-track-background\)/);
  assert.doesNotMatch(
    css,
    /::-webkit-slider-runnable-track,\s*\.range\.(?:hue|saturation)-range::-moz-range-track/,
  );
  assert.match(css, /hsl\(var\(--range-hue\) 100% 50%\)/);
  assert.match(css, /\.section \+ \.section/);
  assert.match(css, /\.section\[open\] \.section-chevron/);
  assert.match(css, /--collapse-container-duration: 180ms/);
  assert.match(
    css,
    /--collapse-container-easing: cubic-bezier\(0\.006, 0\.522, 0\.252, 0\.968\)/,
  );
  assert.match(css, /--collapse-content-duration: 200ms/);
  assert.match(
    css,
    /--collapse-content-easing: cubic-bezier\(0\.004, 0\.505, 0\.202, 0\.918\)/,
  );
  assert.match(css, /--collapse-content-scale-hidden: 0\.98/);
  assert.match(css, /--collapse-content-translate-y-hidden: -10px/);
  assert.match(css, /\.section::details-content/);
  assert.match(css, /margin-inline: -10px/);
  assert.match(css, /padding-inline: 10px/);
  assert.match(css, /--scroll-edge-fade: 24px/);
  assert.match(css, /mask-image: linear-gradient/);
  assert.match(css, /\.button-content span/);
  assert.match(css, /\.glass-dismiss-layer\.active/);
  assert.match(css, /--glass-tint: rgba\(40, 40, 40, 0\.4\)/);
  assert.match(css, /--glass-foreground: #f5f7ff/);
  assert.doesNotMatch(css, /\.sky-canvas\.menu-open/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(readme, /^# AstroShot$/m);
  assert.match(readme, /AndrewPrifer\/liquid-dom/);
  assert.doesNotMatch(readme, /[\u3400-\u9fff]/);
  assert.doesNotMatch(
    readme,
    /spacing=37|bezelWidth=70|499 \/ 22|400 × 680|contentIor|contentDepth/,
  );
});
