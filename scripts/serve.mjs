import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("out");
const port = Number(process.env.PORT || 3000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
try {
  await stat(resolve(root, "index.html"));
} catch {
  console.error("Build the desktop first: npm run build");
  process.exit(1);
}
createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let path = resolve(root, "." + pathname);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let info = await stat(path).catch(() => null);
    if (info?.isDirectory()) {
      path = resolve(path, "index.html");
      info = await stat(path).catch(() => null);
    }
    if (!info && !extname(path)) {
      path += ".html";
      info = await stat(path).catch(() => null);
    }
    if (!info?.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    res.end(req.method === "HEAD" ? undefined : await readFile(path));
  } catch {
    res.writeHead(400);
    res.end("Invalid request");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Stephan’s OS: http://127.0.0.1:${port}`),
);
