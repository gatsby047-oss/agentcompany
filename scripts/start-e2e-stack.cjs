const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const port = process.env.E2E_PORT || "3001";
const baseUrl = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;
const children = [];
let shuttingDown = false;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const fileContents = fs.readFileSync(filePath, "utf8");
  const lines = fileContents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    const isWrappedInQuotes =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (isWrappedInQuotes) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function loadLocalEnv() {
  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, ".env.local"));
  loadEnvFile(path.join(rootDir, ".env.test.local"));
}

function assertRequiredEnv() {
  const missingKeys = ["DATABASE_URL", "REDIS_URL"].filter((key) => !process.env[key]);

  if (missingKeys.length === 0) {
    return;
  }

  throw new Error(
    [
      `Missing required environment variables for E2E startup: ${missingKeys.join(", ")}.`,
      "Copy .env.example to .env before running pnpm test:e2e.",
      "If you are using Docker locally, also run docker compose up -d and pnpm db:push first."
    ].join(" ")
  );
}

function spawnProcess(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const suffix = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(`[e2e-stack] ${label} exited unexpectedly with ${suffix}`);
    void shutdown(code ?? 1);
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    console.error(`[e2e-stack] Failed to start ${label}`, error);
    void shutdown(1);
  });
}

async function waitForHealthyServer(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the server is reachable.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}/api/health`);
}

async function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
  }, 5_000).unref();

  process.exit(exitCode);
}

async function main() {
  loadLocalEnv();
  assertRequiredEnv();

  spawnProcess("next-dev", process.execPath, [
    path.join(rootDir, "scripts", "run-next.cjs"),
    "dev",
    "--port",
    port
  ]);
  spawnProcess("worker", process.execPath, [
    path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs"),
    "src/worker/index.ts"
  ]);

  await waitForHealthyServer(baseUrl, 120_000);
  console.log(`[e2e-stack] Ready at ${baseUrl}`);
  setInterval(() => {}, 60_000);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

void main().catch((error) => {
  console.error("[e2e-stack] Failed to boot", error);
  void shutdown(1);
});
