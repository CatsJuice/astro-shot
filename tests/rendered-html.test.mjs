import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  return readFile(new URL("../out/index.html", import.meta.url), "utf8");
}

test("static export renders the AstroShot shell and controls", async () => {
  const html = await render();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
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

  await access(new URL("../out/.nojekyll", import.meta.url));
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
