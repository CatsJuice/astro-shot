import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve("out");
const port = Number.parseInt(process.env.PORT ?? "3002", 10);
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

async function findFile(pathname) {
  const unprefixedPath =
    basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))
      ? pathname.slice(basePath.length)
      : pathname;
  const relativePath = decodeURIComponent(unprefixedPath).replace(/^\/+/, "");
  const candidate = resolve(root, relativePath || "index.html");

  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;

  try {
    const fileStats = await stat(candidate);
    if (fileStats.isDirectory()) return resolve(candidate, "index.html");
    if (fileStats.isFile()) return candidate;
  } catch {
    if (!extname(candidate)) {
      try {
        const htmlCandidate = `${candidate}.html`;
        if ((await stat(htmlCandidate)).isFile()) return htmlCandidate;
      } catch {
        return null;
      }
    }
  }

  return null;
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const file = await findFile(pathname);

    if (!file) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type":
        contentTypes.get(extname(file)) ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Bad request");
  }
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}${basePath}/`);
});
