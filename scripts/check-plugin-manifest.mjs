#!/usr/bin/env node

/**
 * Pre-publish manifest sync check.
 *
 * Validates that a plugin package's `openclaw.plugin.json` version matches
 * `package.json` version and that `package.json` declares the required
 * `openclaw.extensions` array.
 *
 * Usage:
 *   node scripts/check-plugin-manifest.mjs --package packages/native-scheduler-plugin
 *   node scripts/check-plugin-manifest.mjs --package .   (from inside a package dir)
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function parseArgs(argv) {
  const idx = argv.indexOf("--package");
  if (idx === -1 || idx + 1 >= argv.length) {
    console.error("Usage: check-plugin-manifest.mjs --package <dir>");
    process.exit(1);
  }
  return resolve(argv[idx + 1]);
}

const pkgDir = parseArgs(process.argv);

let pkg;
let manifest;

try {
  pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
} catch (err) {
  console.error(`✗ Cannot read ${join(pkgDir, "package.json")}: ${err.message}`);
  process.exit(1);
}

try {
  manifest = JSON.parse(readFileSync(join(pkgDir, "openclaw.plugin.json"), "utf-8"));
} catch (err) {
  console.error(`✗ Cannot read ${join(pkgDir, "openclaw.plugin.json")}: ${err.message}`);
  process.exit(1);
}

const errors = [];

// Check 1: versions must match
if (pkg.version !== manifest.version) {
  errors.push(
    `Version mismatch: package.json ${pkg.version} ≠ openclaw.plugin.json ${manifest.version}`,
  );
}

// Check 2: package.json must have openclaw.extensions array
if (!Array.isArray(pkg.openclaw?.extensions)) {
  errors.push("package.json missing openclaw.extensions array");
}

if (errors.length > 0) {
  for (const msg of errors) {
    console.error(`✗ ${msg}`);
  }
  process.exit(1);
}

console.log(`✓ ${pkg.name}: manifest sync OK (v${pkg.version})`);
