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
- **Before opening any PR, run the full check suite in order:**
  1. `pnpm lint` — Biome lint + format check (must pass with zero errors)
  2. `pnpm typecheck` — TypeScript type check
  3. `pnpm test` — all tests must pass on all platforms

### Publishing

- On merge to main, release workflow detects changesets and opens "Version Packages" PR
- When that PR merges, publishes to npm automatically under `@spectratools` scope
- `NPM_TOKEN` secret required in GitHub Actions

## Don't

- Don't use inline `--body` for PR creation — use `--body-file`
- Don't skip changesets — CI enforces them and will fail without one
- Don't use `fs.chmod` to simulate permission errors in tests without a Windows skip guard
- Don't run `pnpm changeset version` or `pnpm changeset publish` locally
