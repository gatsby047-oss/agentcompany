const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function isUsableNextDir(nextDir) {
  return (
    fs.existsSync(path.join(nextDir, "package.json")) &&
    fs.existsSync(path.join(nextDir, "dist", "bin", "next")) &&
    fs.existsSync(path.join(nextDir, "dist", "server", "require-hook.js"))
  );
}

function findNextBinary(rootDir) {
  const directNextDir = path.join(rootDir, "node_modules", "next");
  if (isUsableNextDir(directNextDir)) {
    return path.join(directNextDir, "dist", "bin", "next");
  }

  const pnpmDir = path.join(rootDir, "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmDir)) {
    throw new Error("Cannot find node_modules/.pnpm while resolving Next.js");
  }

  const candidateDirs = fs
    .readdirSync(pnpmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("next@"))
    .map((entry) => path.join(pnpmDir, entry.name, "node_modules", "next"))
    .filter(isUsableNextDir);

  if (candidateDirs.length === 0) {
    throw new Error("Cannot find a usable Next.js installation");
  }

  candidateDirs.sort((left, right) => {
    const leftHasReactPeer = left.includes("react-dom@");
    const rightHasReactPeer = right.includes("react-dom@");

    if (leftHasReactPeer === rightHasReactPeer) {
      return left.localeCompare(right);
    }

    return leftHasReactPeer ? -1 : 1;
  });

  return path.join(candidateDirs[0], "dist", "bin", "next");
}

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const nextBin = findNextBinary(rootDir);
  const nextBinDir = path.dirname(nextBin);
  const extraNodePaths = [
    path.join(nextBinDir, "node_modules"),
    path.resolve(nextBinDir, "..", "node_modules"),
    path.resolve(nextBinDir, "..", "..", "node_modules"),
    path.resolve(nextBinDir, "..", "..", ".."),
    path.join(rootDir, "node_modules", ".pnpm", "node_modules")
  ];
  const pathDelimiter = path.delimiter;
  const nodePath = [
    ...extraNodePaths,
    process.env.NODE_PATH
  ]
    .filter(Boolean)
    .join(pathDelimiter);
  const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_PATH: nodePath
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
