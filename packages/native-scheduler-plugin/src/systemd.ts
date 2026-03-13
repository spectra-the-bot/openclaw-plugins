import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type SystemdJobInput = {
  id: string;
  description?: string;
  command: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  startIntervalSeconds?: number;
  disabled?: boolean;
};

type ExecResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type PluginLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

export type SystemdAdapterDeps = {
  platform?: string;
  homedir?: () => string;
  fs?: Pick<typeof fs, "mkdir" | "writeFile" | "rm" | "readdir" | "access">;
  execSystemctl?: (args: string[]) => Promise<ExecResult>;
};

type SystemdAdapterOptions = {
  namespace: string;
  logger?: PluginLogger;
  deps?: SystemdAdapterDeps;
};

function defaultExecSystemctl(args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("systemctl", ["--user", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export function sanitizeSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildLabel(namespace: string, id: string) {
  const cleanedNamespace = sanitizeSegment(namespace);
  const cleanedId = sanitizeSegment(id);
  if (!cleanedNamespace) {
    throw new Error("namespace resolved to an empty systemd label prefix");
  }
  if (!cleanedId) {
    throw new Error("job id resolved to an empty systemd label suffix");
  }
  return `${cleanedNamespace}-${cleanedId}`;
}

function escapeSystemdValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function renderServiceUnit(label: string, job: SystemdJobInput) {
  const desc = job.description ?? `${job.id} (native-scheduler)`;
  const execLine = job.command.map((arg) => `"${escapeSystemdValue(arg)}"`).join(" ");

  let content = `[Unit]
Description=${label} - ${desc}

[Service]
Type=oneshot
ExecStart=${execLine}
`;

  if (job.workingDirectory) {
    content += `WorkingDirectory=${job.workingDirectory}\n`;
  }

  if (job.environment && Object.keys(job.environment).length > 0) {
    for (const [key, value] of Object.entries(job.environment)) {
      content += `Environment="${escapeSystemdValue(key)}=${escapeSystemdValue(value)}"\n`;
    }
  }

  return content;
}

export function renderTimerUnit(label: string, job: SystemdJobInput) {
  const desc = job.description ?? `${job.id} timer (native-scheduler)`;
  const interval = job.startIntervalSeconds ?? 300;

  return `[Unit]
Description=${label} timer - ${desc}

[Timer]
OnBootSec=${interval}s
OnUnitActiveSec=${interval}s
Unit=${label}.service

[Install]
WantedBy=timers.target
`;
}

async function pathExists(fsImpl: Pick<typeof fs, "access">, filePath: string) {
  try {
    await fsImpl.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function createSystemdAdapter(options: SystemdAdapterOptions) {
  const fsImpl = options.deps?.fs ?? fs;
  const platform = options.deps?.platform ?? process.platform;
  const homedir = options.deps?.homedir ?? os.homedir;
  const execSystemctl = options.deps?.execSystemctl ?? defaultExecSystemctl;

  if (platform !== "linux") {
    throw new Error("systemd adapter is only available on Linux");
  }

  const unitDir = path.join(homedir(), ".config", "systemd", "user");

  function resolveLabel(id: string) {
    return buildLabel(options.namespace, id);
  }

  function resolveServicePath(id: string) {
    return path.join(unitDir, `${resolveLabel(id)}.service`);
  }

  function resolveTimerPath(id: string) {
    return path.join(unitDir, `${resolveLabel(id)}.timer`);
  }

  return {
    async list() {
      const result = await execSystemctl(["list-timers", "--all", "--no-pager"]);
      const prefix = `${sanitizeSegment(options.namespace)}-`;
      const ids: string[] = [];

      for (const line of result.stdout.split(/\r?\n/)) {
        const match = line.match(
          new RegExp(`(${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\w.-]+)\\.timer`),
        );
        if (match) {
          const label = match[1]!;
          ids.push(label.slice(prefix.length));
        }
      }

      ids.sort();
      return {
        backend: "systemd",
        unitDir,
        jobs: ids.map((id) => ({
          id,
          label: resolveLabel(id),
          servicePath: resolveServicePath(id),
          timerPath: resolveTimerPath(id),
        })),
      };
    },

    async get(id: string) {
      const label = resolveLabel(id);
      return {
        id,
        label,
        servicePath: resolveServicePath(id),
        timerPath: resolveTimerPath(id),
        exists: await pathExists(fsImpl, resolveTimerPath(id)),
      };
    },

    async upsert(job: SystemdJobInput) {
      if (!job.command.length) {
        throw new Error("job.command must contain at least one item");
      }

      await fsImpl.mkdir(unitDir, { recursive: true });

      const label = resolveLabel(job.id);
      const servicePath = resolveServicePath(job.id);
      const timerPath = resolveTimerPath(job.id);

      await fsImpl.writeFile(servicePath, renderServiceUnit(label, job), "utf8");
      await fsImpl.writeFile(timerPath, renderTimerUnit(label, job), "utf8");

      await execSystemctl(["daemon-reload"]);

      if (job.disabled) {
        await execSystemctl(["disable", `${label}.timer`]);
      } else {
        await execSystemctl(["enable", "--now", `${label}.timer`]);
      }

      return {
        changed: true,
        label,
        servicePath,
        timerPath,
      };
    },

    async remove(id: string) {
      const label = resolveLabel(id);
      const servicePath = resolveServicePath(id);
      const timerPath = resolveTimerPath(id);

      await execSystemctl(["stop", `${label}.timer`]);
      await execSystemctl(["disable", `${label}.timer`]);
      await fsImpl.rm(servicePath, { force: true });
      await fsImpl.rm(timerPath, { force: true });
      await execSystemctl(["daemon-reload"]);

      return {
        removed: true,
        id,
        label,
        servicePath,
        timerPath,
      };
    },

    async run(id: string) {
      const label = resolveLabel(id);
      const result = await execSystemctl(["start", `${label}.service`]);
      if (result.code !== 0) {
        throw new Error(`systemctl start failed: ${result.stderr || result.stdout}`);
      }
      return {
        started: true,
        id,
        label,
      };
    },

    async enable(id: string) {
      const label = resolveLabel(id);
      const result = await execSystemctl(["enable", `${label}.timer`]);
      if (result.code !== 0) {
        throw new Error(`systemctl enable failed: ${result.stderr || result.stdout}`);
      }
      return {
        enabled: true,
        id,
        label,
      };
    },

    async disable(id: string) {
      const label = resolveLabel(id);
      const result = await execSystemctl(["disable", `${label}.timer`]);
      if (result.code !== 0) {
        throw new Error(`systemctl disable failed: ${result.stderr || result.stdout}`);
      }
      return {
        disabled: true,
        id,
        label,
      };
    },
  };
}
