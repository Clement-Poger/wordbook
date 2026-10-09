const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/icons.svg", ["icons.svg", "image/svg+xml"]],
]);

function sendJsonConfig(response) {
  const config = {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
  };
  response.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`window.WORDSTEP_SUPABASE_CONFIG = ${JSON.stringify(config).replace(/</g, "\\u003c")};`);
}

function contentSecurityPolicy() {
  const connectOrigins = [];
  try {
    const projectUrl = new URL(process.env.SUPABASE_URL);
    if (projectUrl.protocol === "https:" || projectUrl.hostname === "localhost") {
      connectOrigins.push(projectUrl.origin);
      connectOrigins.push(`${projectUrl.protocol === "https:" ? "wss:" : "ws:"}//${projectUrl.host}`);
    }
  } catch {
    // A missing or malformed project URL is reported by the login screen.
  }

  return [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${connectOrigins.join(" ")}`,
    "font-src 'self' https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

async function handleRequest(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Content-Security-Policy", contentSecurityPolicy());

  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/supabase-config.js" && request.method === "GET") {
    return sendJsonConfig(response);
  }

  const asset = STATIC_FILES.get(url.pathname);
  if (request.method !== "GET" || !asset) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found.");
    return;
  }

  const content = await readFile(path.join(PUBLIC_DIR, asset[0]));
  response.writeHead(200, {
    "Content-Type": asset[1],
    "Cache-Control": "no-cache",
  });
  response.end(content);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Request failed:", error);
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Something went wrong.");
    } else {
      response.destroy(error);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Wordstep is ready at http://${HOST}:${PORT}`);
});
