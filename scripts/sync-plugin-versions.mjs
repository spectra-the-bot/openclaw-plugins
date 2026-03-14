#!/usr/bin/env node

/**
 * Post-changeset version sync.
 *
 * After `changeset version` bumps package.json files, this script copies
 * the version from each plugin's `package.json` into its `openclaw.plugin.json`
 * so the two stay in sync automatically.
 *
 * Called as part of `pnpm changeset:version` in the root package.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const PLUGIN_DIRS = ["packages/native-scheduler-plugin", "packages/sentinel-plugin"];

let synced = 0;

for (const dir of PLUGIN_DIRS) {
  const pkgPath = join(ROOT, dir, "package.json");
  const manifestPath = join(ROOT, dir, "openclaw.plugin.json");

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  if (pkg.version !== manifest.version) {
    console.log(`⟳ ${pkg.name}: ${manifest.version} → ${pkg.version}`);
    manifest.version = pkg.version;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    synced++;
  } else {
    console.log(`✓ ${pkg.name}: already at ${pkg.version}`);
  }
}

console.log(`\nDone — ${synced} manifest(s) updated.`);
