import fs from "fs";
import path from "path";
import process from "process";
import { createRequire } from "module";
import { spawnSync } from "child_process";

const require = createRequire(import.meta.url);

const PLATFORM_PACKAGE_MAP = {
  "darwin-arm64": "@esbuild/darwin-arm64",
  "darwin-x64": "@esbuild/darwin-x64",
  "linux-arm": "@esbuild/linux-arm",
  "linux-arm64": "@esbuild/linux-arm64",
  "linux-ia32": "@esbuild/linux-ia32",
  "linux-loong64": "@esbuild/linux-loong64",
  "linux-mips64el": "@esbuild/linux-mips64el",
  "linux-ppc64": "@esbuild/linux-ppc64",
  "linux-riscv64": "@esbuild/linux-riscv64",
  "linux-s390x": "@esbuild/linux-s390x",
  "linux-x64": "@esbuild/linux-x64",
  "win32-arm64": "@esbuild/win32-arm64",
  "win32-ia32": "@esbuild/win32-ia32",
  "win32-x64": "@esbuild/win32-x64",
};

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const shouldFix = args.has("--fix");
const platformKey = `${process.platform}-${process.arch}`;
const expectedPackage = PLATFORM_PACKAGE_MAP[platformKey];

function getInstalledPlatformPackages() {
  const esbuildDir = path.join(rootDir, "node_modules", "@esbuild");

  if (!fs.existsSync(esbuildDir)) {
    return [];
  }

  return fs
    .readdirSync(esbuildDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `@esbuild/${entry.name}`)
    .sort();
}

function canRunEsbuild() {
  try {
    const esbuild = require("esbuild");
    esbuild.transformSync("const value = 1;", { loader: "js" });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  }
}

function logCurrentState(installedPackages) {
  const installedText = installedPackages.length > 0
    ? installedPackages.join(", ")
    : "(none)";

  console.log(`[doctor:esbuild] Current platform: ${platformKey}`);
  console.log(`[doctor:esbuild] Expected package: ${expectedPackage ?? "unsupported platform"}`);
  console.log(`[doctor:esbuild] Installed @esbuild packages: ${installedText}`);
}

function installForCurrentPlatform() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const hasLockfile = fs.existsSync(path.join(rootDir, "package-lock.json"));
  const installArgs = hasLockfile ? ["ci"] : ["install"];

  console.log(`[doctor:esbuild] Running \`${npmCmd} ${installArgs.join(" ")}\` for ${platformKey}...`);

  const result = spawnSync(npmCmd, installArgs, {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    console.error("[doctor:esbuild] Failed to run npm:", result.error.message);
    process.exit(1);
  }
}

if (!expectedPackage) {
  console.error(`[doctor:esbuild] Unsupported platform: ${platformKey}`);
  process.exit(1);
}

const installedPackages = getInstalledPlatformPackages();
const runtimeCheck = canRunEsbuild();

if (runtimeCheck.ok) {
  logCurrentState(installedPackages);
  console.log("[doctor:esbuild] esbuild is ready.");
  process.exit(0);
}

logCurrentState(installedPackages);

console.error("[doctor:esbuild] esbuild cannot run on this platform.");
console.error(`[doctor:esbuild] Root cause: this workspace is using native dependencies from another OS/CPU.`);

if (!shouldFix) {
  console.error("[doctor:esbuild] Run `npm run doctor:esbuild:fix` to reinstall dependencies for the current platform.");
  console.error("[doctor:esbuild] For long-term dual-environment work, keep separate clones/worktrees per OS, or reinstall after switching systems.");
  console.error("");
  console.error(runtimeCheck.error?.message ?? String(runtimeCheck.error));
  process.exit(1);
}

installForCurrentPlatform();

const postInstallCheck = canRunEsbuild();

if (!postInstallCheck.ok) {
  console.error("[doctor:esbuild] Reinstall finished, but esbuild still cannot run.");
  console.error(postInstallCheck.error?.message ?? String(postInstallCheck.error));
  process.exit(1);
}

console.log("[doctor:esbuild] Reinstall complete. esbuild now matches the current platform.");
