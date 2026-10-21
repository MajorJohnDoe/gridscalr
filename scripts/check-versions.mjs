import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const packageJson = JSON.parse(await read("package.json"));
const tauriConfig = JSON.parse(await read("src-tauri/tauri.conf.json"));
const cargoToml = await read("src-tauri/Cargo.toml");
const cargoLock = await read("src-tauri/Cargo.lock");

const cargoPackage = cargoToml.match(/^\[package\]\s*([\s\S]*?)(?=^\[)/m)?.[1] ?? "";
const cargoVersion = cargoPackage.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockVersion = cargoLock.match(
  /^\[\[package\]\]\s*\nname\s*=\s*"gridscalr"\s*\nversion\s*=\s*"([^"]+)"/m,
)?.[1];

const versions = {
  "package.json": packageJson.version,
  "src-tauri/tauri.conf.json": tauriConfig.version,
  "src-tauri/Cargo.toml": cargoVersion,
  "src-tauri/Cargo.lock": cargoLockVersion,
};

const missing = Object.entries(versions)
  .filter(([, version]) => !version)
  .map(([file]) => file);

if (missing.length > 0) {
  console.error(`Could not read the app version from: ${missing.join(", ")}`);
  process.exit(1);
}

const uniqueVersions = new Set(Object.values(versions));
if (uniqueVersions.size !== 1) {
  console.error("App versions are out of sync:");
  for (const [file, version] of Object.entries(versions)) {
    console.error(`  ${file}: ${version}`);
  }
  console.error("Update package.json, tauri.conf.json, Cargo.toml and Cargo.lock together.");
  process.exit(1);
}

console.log(`App version: ${packageJson.version}`);
