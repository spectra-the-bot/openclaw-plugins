# CLAUDE.md — Agent Guide for openclaw-plugins

## Project Overview

`openclaw-plugins` is a monorepo containing OpenClaw plugin packages:

- **native-scheduler-plugin** (`@spectratools/native-scheduler`) — cross-platform native OS scheduler (launchd, systemd, schtasks)
- **native-scheduler-types** (`@spectratools/native-scheduler-types`) — shared TypeScript types for the scheduler
- **sentinel-plugin** (`@spectratools/sentinel`) — declarative gateway-native watcher system

**Repository:** https://github.com/spectra-the-bot/openclaw-plugins

## Tech Stack

- **pnpm** (workspace protocol, `pnpm-workspace.yaml`)
- **TypeScript** (strict, `tsconfig.base.json` at root)
- **Biome** (linter + formatter — replaces ESLint + Prettier)
- **vitest** (test runner)
- **changesets** (version management + npm publish)
- **OpenClaw Plugin SDK** (`openclaw/plugin-sdk`) — `api.runtime.*`, `api.logger`, tool registration

## Directory Structure

```
openclaw-plugins/
├── packages/
│   ├── native-scheduler-plugin/   → @spectratools/native-scheduler
│   ├── native-scheduler-types/    → @spectratools/native-scheduler-types
│   └── sentinel-plugin/           → @spectratools/sentinel
├── .changeset/                    → Changesets config
├── .github/workflows/
│   ├── ci.yml                     → Build + test + typecheck + lint + changeset validation
│   ├── docs.yml                   → VitePress docs deploy to GitHub Pages
│   ├── release.yml                → Changeset-driven npm publish
│   ├── external-intake.yml        → External contribution guard
│   └── label-guard.yml            → PR label enforcement
├── docs/                          → VitePress docs site (plugins.spectratools.dev)
├── biome.json
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

## Commands

```bash
pnpm install
pnpm build          # build all packages
pnpm test           # run all tests
pnpm typecheck      # type check all packages
pnpm lint           # biome check
pnpm format         # biome format
pnpm changeset      # create a changeset
```

## ⚠️ Before Opening Any PR

**CI will reject your PR if you skip this.** This has caused repeated failures — do not skip these steps.

```bash
# Step 1: Auto-fix lint and formatting issues (import order, quotes, semicolons, etc.)
pnpm biome check --write .

# Step 2: Verify no remaining errors (this is exactly what CI runs)
pnpm exec biome check --diagnostic-level=error .

# Step 3: Type check
pnpm typecheck

# Step 4: Run tests
pnpm test
```

**All four steps must pass before you push.** If step 2 reports errors after step 1, fix them manually and repeat.

### What Biome catches that is easy to miss

- **Import ordering** — Biome auto-sorts imports (`organizeImports`). If you don't run `--write`, CI fails.
- **Formatting** — 2-space indent, 100-char line width, double quotes, trailing commas, semicolons. Any deviation fails CI.
- **Assignment in expressions** — `if (x = foo())` is banned; use `const x = foo(); if (x)` instead.
- **Recommended lint rules** — no explicit `any` (warn), no non-null assertions (warn), plus all Biome recommended rules.

---

## Key Conventions

### Code Style

- Biome enforces formatting and linting — no eslint/prettier
- Strict TypeScript throughout
- Plugin SDK imports: `import { ... } from 'openclaw/plugin-sdk'`
- Tool registration via `api.registerTool(...)` or equivalent SDK pattern

### Plugin SDK Patterns

- `api.runtime.system.runCommandWithTimeout(argv, { timeoutMs })` — run shell commands
- `api.runtime.channel.<channel>.sendMessage<Channel>(target, text, opts)` — zero-token channel delivery
- `api.logger?.info/warn/error(...)` — structured logging
- `api.config` — plugin config at runtime
- Tools must use TypeBox schemas (`@sinclair/typebox`) for parameter definitions
- Return `jsonResult(payload)` for tool results

### PR and Git

- **PR bodies via `--body-file`** — never inline multiline markdown in `--body "..."`
- Squash merge PRs to main
- Branch naming: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`
- **Every PR that modifies package source code MUST include a changeset file**

### Changesets (CRITICAL)

- Any PR that modifies files under `packages/*/src/` or `packages/*/skills/` or `packages/*/openclaw.plugin.json` must include a `.changeset/<descriptive-name>.md` file
- Format:
  ```markdown
  ---
  "@spectratools/<package-name>": patch|minor|major
  ---

  One-line description of what changed.
  ```
- Bump type: `patch` for bug fixes, `minor` for new features, `major` for breaking changes
- **Do NOT run `pnpm changeset version` or `pnpm changeset publish` locally** — CI handles it
- CI will fail with "Some packages have been changed but no changesets were found" if missing

### Testing

- vitest with workspace config
- Mock OS/filesystem interactions for platform-specific tests
- **Platform guard for chmod tests**: `fs.chmod` is a no-op on Windows. Any test that relies on EACCES from chmod must skip on Windows: `it.skipIf(process.platform === 'win32')(...)`
- **Before opening any PR, run the full pre-PR checklist above** — lint, typecheck, test. Always start with `pnpm biome check --write .` to auto-fix formatting.

### Publishing

- On merge to main, release workflow detects changesets and opens "Version Packages" PR
- When that PR merges, publishes to npm automatically under `@spectratools` scope
- `NPM_TOKEN` secret required in GitHub Actions

## Don't

- Don't use inline `--body` for PR creation — use `--body-file`
- Don't skip changesets — CI enforces them and will fail without one
- Don't use `fs.chmod` to simulate permission errors in tests without a Windows skip guard
- Don't run `pnpm changeset version` or `pnpm changeset publish` locally
- **Don't push without running `pnpm biome check --write .` first** — CI runs biome and will reject unformatted code. Import order, formatting, and lint rules are all enforced.
