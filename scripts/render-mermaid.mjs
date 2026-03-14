#!/usr/bin/env node

/**
 * Pre-renders Mermaid code fences in docs/ to static SVGs.
 *
 * Scans all .md files under docs/ for ```mermaid fences, hashes each
 * diagram's source, and renders it to docs/public/diagrams/<hash>.svg
 * via mmdc (@mermaid-js/mermaid-cli).
 *
 * Source .md files are NOT modified. The companion markdown-it plugin
 * (docs/.vitepress/mermaid-plugin.ts) replaces fences with <img> tags
 * at VitePress build time.
 *
 * Idempotent: existing SVGs with matching hashes are skipped.
 *
 * Usage:
 *   node scripts/render-mermaid.mjs          # render all
 *   node scripts/render-mermaid.mjs --clean  # remove stale SVGs
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOCS_DIR = join(ROOT, "docs");
const OUT_DIR = join(DOCS_DIR, "public", "diagrams");
const MMDC = join(ROOT, "node_modules", ".bin", "mmdc");

const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g;

function findMarkdownFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && entry !== "node_modules" && entry !== ".vitepress") {
      results.push(...findMarkdownFiles(full));
    } else if (entry.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

export function contentHash(source) {
  return createHash("sha256").update(source.trim()).digest("hex").slice(0, 12);
}

function renderSvg(mermaidSource, outputPath) {
  const tmpInput = join(OUT_DIR, "_tmp_input.mmd");
  writeFileSync(tmpInput, mermaidSource, "utf-8");

  try {
    execFileSync(MMDC, ["-i", tmpInput, "-o", outputPath, "-b", "transparent", "--quiet"], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
      env: { ...process.env },
    });
  } finally {
    try {
      unlinkSync(tmpInput);
    } catch {}
  }

  // Post-process: make SVG responsive (remove fixed dimensions)
  if (existsSync(outputPath)) {
    let svg = readFileSync(outputPath, "utf-8");
    svg = svg.replace(/\s+width="[^"]*"/g, "").replace(/\s+height="[^"]*"/g, "");
    if (!svg.includes('style="')) {
      svg = svg.replace("<svg", '<svg style="max-width:100%;height:auto"');
    }
    writeFileSync(outputPath, svg, "utf-8");
  }
}

function render() {
  mkdirSync(OUT_DIR, { recursive: true });

  const mdFiles = findMarkdownFiles(DOCS_DIR);
  const activeHashes = new Set();
  let totalDiagrams = 0;
  let rendered = 0;

  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, "utf-8");
    MERMAID_FENCE_RE.lastIndex = 0;
    let match = MERMAID_FENCE_RE.exec(content);

    while (match !== null) {
      totalDiagrams++;
      const trimmed = match[1].trim();
      const hash = contentHash(trimmed);
      const svgName = `${hash}.svg`;
      const svgPath = join(OUT_DIR, svgName);
      activeHashes.add(svgName);

      if (!existsSync(svgPath)) {
        const relPath = mdFile.replace(ROOT + "/", "");
        console.log(`  Rendering ${relPath} → ${svgName}`);
        renderSvg(trimmed, svgPath);
        rendered++;
      }
      match = MERMAID_FENCE_RE.exec(content);
    }
  }

  // Clean stale SVGs
  if (process.argv.includes("--clean") && existsSync(OUT_DIR)) {
    for (const file of readdirSync(OUT_DIR)) {
      if (file.endsWith(".svg") && !activeHashes.has(file)) {
        console.log(`  Removing stale: ${file}`);
        unlinkSync(join(OUT_DIR, file));
      }
    }
  }

  console.log(`\n✅ Found ${totalDiagrams} diagram(s), rendered ${rendered} new SVG(s)`);
}

render();
