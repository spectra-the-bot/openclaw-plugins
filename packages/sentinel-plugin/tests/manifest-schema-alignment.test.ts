import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sentinelConfigSchema } from "../src/configSchema.js";

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "openclaw.plugin.json"), "utf-8"),
);

describe("manifest ↔ configSchema alignment", () => {
  it("manifest configSchema.properties keys match sentinelConfigSchema.jsonSchema.properties keys", () => {
    const manifestKeys = Object.keys(manifest.configSchema.properties).sort();
    const codeKeys = Object.keys(sentinelConfigSchema.jsonSchema.properties).sort();

    expect(manifestKeys).toEqual(codeKeys);
  });

  it("manifest has non-empty name, description, and version", () => {
    expect(typeof manifest.name).toBe("string");
    expect(manifest.name.length).toBeGreaterThan(0);

    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(0);

    expect(typeof manifest.version).toBe("string");
    expect(manifest.version.length).toBeGreaterThan(0);
  });

  it("openclaw.plugin.json version matches package.json version", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8"));
    expect(manifest.version).toBe(pkg.version);
  });
});
