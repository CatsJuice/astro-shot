import { execFileSync } from "node:child_process";
import {
  access,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = join(projectRoot, "dist", "xhs");
const artifactPath = join(projectRoot, "dist", "astroshot-xhs.zip");
const allowedExtensions = new Set([
  ".css",
  ".gif",
  ".html",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".png",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertRelativeAssetReference(reference, sourceFile) {
  if (
    reference.startsWith("data:") ||
    reference.startsWith("blob:") ||
    reference.startsWith("#")
  ) {
    return;
  }

  assert(
    !/^(?:https?:)?\/\//i.test(reference),
    `${sourceFile} references an external resource: ${reference}`,
  );
  assert(
    !reference.startsWith("/"),
    `${sourceFile} uses an absolute resource path: ${reference}`,
  );
}

async function validateReferencedFile(reference, sourcePath) {
  if (
    reference.startsWith("data:") ||
    reference.startsWith("blob:") ||
    reference.startsWith("#")
  ) {
    return;
  }

  const cleanReference = reference.split(/[?#]/, 1)[0];
  const referencedPath = resolve(sourcePath, "..", cleanReference);
  assert(
    referencedPath.startsWith(`${outputDirectory}/`),
    `Resource escapes the package root: ${reference}`,
  );
  await access(referencedPath);
}

async function validateOutput() {
  const indexPath = join(outputDirectory, "index.html");
  await access(indexPath);

  const files = await walk(outputDirectory);
  assert(files.length > 1, "The XHS build output is unexpectedly empty");

  for (const file of files) {
    const fileName = relative(outputDirectory, file);
    assert(
      allowedExtensions.has(extname(file).toLowerCase()),
      `Unsupported file type in XHS package: ${fileName}`,
    );
    assert(!fileName.endsWith(".map"), `Source map found in package: ${fileName}`);
    assert(
      !/(^|\/)(?:node_modules|\.git)(\/|$)|(^|\/)\.DS_Store$/u.test(fileName),
      `Development artifact found in package: ${fileName}`,
    );
  }

  const html = await readFile(indexPath, "utf8");
  assert(/^<!doctype html>/i.test(html.trimStart()), "index.html needs a doctype");
  assert(/<html[^>]+lang="zh-CN"/i.test(html), "index.html needs lang=\"zh-CN\"");
  assert(/<meta[^>]+charset="UTF-8"/i.test(html), "index.html needs UTF-8 charset");
  assert(
    /<meta[^>]+name="viewport"[^>]+content="[^"]*width=device-width[^"]*initial-scale=1\.0[^"]*viewport-fit=cover[^"]*"/i.test(
      html,
    ),
    "index.html viewport is missing required mobile and safe-area settings",
  );
  assert(!/<base\b/i.test(html), "The XHS package cannot use <base>");
  assert(!/<(?:iframe|object)\b/i.test(html), "The XHS package cannot use iframe/object");
  assert(
    !/<meta[^>]+http-equiv=["']Content-Security-Policy/i.test(html),
    "Container CSP must not be overridden",
  );
  assert(!/\son\w+\s*=/i.test(html), "Inline event handlers are not allowed");
  assert(!/javascript:/i.test(html), "javascript: URLs are not allowed");

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert(/\bsrc\s*=/i.test(match[1]), "Every script must use a local src");
    assert(match[2].trim() === "", "Inline script content is not allowed");
  }

  const htmlReferences = [
    ...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi),
  ].map((match) => match[1]);

  for (const reference of htmlReferences) {
    assertRelativeAssetReference(reference, "index.html");
    await validateReferencedFile(reference, indexPath);
  }

  const textFiles = files.filter((file) =>
    [".css", ".html", ".js"].includes(extname(file).toLowerCase()),
  );
  const forbiddenPatterns = [
    [/\bfetch\s*\(/u, "network fetch"],
    [/\bXMLHttpRequest\b/u, "XMLHttpRequest"],
    [/\b(?:WebSocket|EventSource|RTCPeerConnection)\s*\(/u, "network communication"],
    [/\bnavigator\.(?:geolocation|clipboard|bluetooth|usb|hid|serial)\b/u, "restricted device API"],
    [/\bnavigator\.serviceWorker\b/u, "service worker"],
    [/\bnew\s+(?:Shared)?Worker\s*\(/u, "worker"],
    [/\b(?:eval|Function)\s*\(/u, "dynamic code execution"],
    [/\bWebAssembly\b/u, "WebAssembly"],
    [/\bwindow\.(?:open|prompt)\s*\(/u, "restricted window API"],
    [/\brequestFullscreen\s*\(/u, "fullscreen API"],
    [/\btarget=["']_blank["']/iu, "external-window link"],
    [/\.\s*download\s*=/u, "file download"],
  ];

  for (const file of textFiles) {
    const contents = await readFile(file, "utf8");
    const fileName = relative(outputDirectory, file);

    for (const [pattern, label] of forbiddenPatterns) {
      assert(!pattern.test(contents), `${fileName} contains forbidden ${label}`);
    }

    if (extname(file) === ".css") {
      for (const match of contents.matchAll(/url\((?:["']?)([^)"']+)/gi)) {
        const reference = match[1].trim();
        assertRelativeAssetReference(reference, fileName);
        await validateReferencedFile(reference, file);
      }
    }
  }

  for (const file of files.filter((candidate) => extname(candidate) === ".js")) {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  }

  return files;
}

const files = await validateOutput();
await rm(artifactPath, { force: true });
execFileSync("zip", ["-q", "-r", artifactPath, "."], {
  cwd: outputDirectory,
  stdio: "inherit",
});

const archiveEntries = execFileSync("unzip", ["-Z1", artifactPath], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
assert(archiveEntries.includes("index.html"), "ZIP root is missing index.html");
assert(
  !archiveEntries.some((entry) => entry.startsWith("xhs/")),
  "ZIP contains an extra top-level directory",
);

const unpackedBytes = (
  await Promise.all(files.map(async (file) => (await stat(file)).size))
).reduce((total, size) => total + size, 0);
const zippedBytes = (await stat(artifactPath)).size;
assert(zippedBytes <= 10 * 1024 * 1024, "ZIP exceeds the 10 MB package limit");

console.log(
  JSON.stringify(
    {
      artifact: relative(projectRoot, artifactPath),
      files: files.length,
      unpackedBytes,
      zippedBytes,
    },
    null,
    2,
  ),
);
