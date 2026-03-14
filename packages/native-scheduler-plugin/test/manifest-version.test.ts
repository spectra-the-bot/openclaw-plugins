import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "openclaw.plugin.json"), "utf-8"),
);

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8"));

describe("openclaw.plugin.json ↔ package.json alignment", () => {
  it("versions match", () => {
    expect(manifest.version).toBe(pkg.version);
  });

  it("manifest has non-empty name, description, and version", () => {
    expect(typeof manifest.name).toBe("string");
    expect(manifest.name.length).toBeGreaterThan(0);

    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(0);

    expect(typeof manifest.version).toBe("string");
    expect(manifest.version.length).toBeGreaterThan(0);
  });
});
