import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// MIDDLEWARE DE DIAGNÓSTICO GLOBAL - Captura TODOS os POSTs
app.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log(`\n[REDE] ========================================`);
    console.log(`[REDE] Recebido POST em: ${req.url}`);
    console.log(`[REDE] Content-Type: ${req.headers['content-type']}`);
    console.log(`[REDE] User-Agent: ${req.headers['user-agent']?.substring(0, 50) || 'N/A'}`);
    console.log(`[REDE] ========================================\n`);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  const publicPath = path.resolve(__dirname, "..", "dist", "public");

  if (!fs.existsSync(publicPath)) {
    log(`Build directory not found at ${publicPath}. Run 'vite build' first.`);
  }

  app.use(express.static(publicPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(publicPath, "index.html"));
  });

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`Servidor rodando na porta ${port}`);
  });
})();
