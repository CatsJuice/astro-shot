import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourcePath = process.argv[2];
const outputPath = process.argv[3] ?? "public/data/stars.json";

if (!sourcePath) {
  throw new Error(
    "Usage: node scripts/build-star-catalog.mjs <hygdata_v41.csv> [output.json]",
  );
}

function parseCsvLine(line) {
  const fields = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  fields.push(value);
  return fields;
}

const raw = readFileSync(sourcePath, "utf8");
const lines = raw.split(/\r?\n/);
const headers = parseCsvLine(lines[0]);
const index = Object.fromEntries(headers.map((header, position) => [header, position]));
const stars = [];
const magnitudeLimit = 7.75;

for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
  const line = lines[lineIndex];
  if (!line) continue;
  const fields = parseCsvLine(line);
  const raHours = Number(fields[index.ra]);
  const decDegrees = Number(fields[index.dec]);
  const magnitude = Number(fields[index.mag]);
  const colorIndex = Number(fields[index.ci]);

  if (
    !Number.isFinite(raHours) ||
    !Number.isFinite(decDegrees) ||
    !Number.isFinite(magnitude) ||
    magnitude > magnitudeLimit
  ) {
    continue;
  }

  const properName = fields[index.proper]?.trim();
  stars.push([
    Number(((raHours * Math.PI) / 12).toFixed(7)),
    Number(((decDegrees * Math.PI) / 180).toFixed(7)),
    Number(magnitude.toFixed(2)),
    Number.isFinite(colorIndex) ? Number(colorIndex.toFixed(2)) : null,
    properName || null,
  ]);
}

stars.sort((a, b) => b[2] - a[2]);
const destination = resolve(outputPath);
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(
  destination,
  JSON.stringify({
    source: "HYG Star Database v4.1",
    catalogues: ["Hipparcos", "Yale Bright Star", "Gliese"],
    license: "CC BY-SA 4.0",
    magnitudeLimit,
    count: stars.length,
    stars,
  }),
);

console.log(`Wrote ${stars.length.toLocaleString()} real stars to ${destination}`);
