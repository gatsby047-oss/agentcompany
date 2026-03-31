const path = require("path");
const { spawn } = require("child_process");

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const cliPath = require.resolve("@playwright/test/cli");
  const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: path.join(rootDir, ".playwright-browsers-local")
    }
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
}

void main();
