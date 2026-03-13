import { spawn } from "node:child_process";

export type CronJobInput = {
  id: string;
  description?: string;
  command: string[];
  environment?: Record<string, string>;
  startIntervalSeconds?: number;
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

export type CronAdapterDeps = {
  platform?: string;
  execCrontab?: (args: string[], stdin?: string) => Promise<ExecResult>;
  spawnDirect?: (command: string[]) => Promise<{ code: number }>;
};

type CronAdapterOptions = {
  namespace: string;
  logger?: PluginLogger;
  deps?: CronAdapterDeps;
};

function defaultExecCrontab(args: string[], stdin?: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("crontab", args, {
      stdio: [stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });

    if (stdin !== undefined && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

function defaultSpawnDirect(command: string[]): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), {
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1 });
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

export function buildSentinel(namespace: string, id: string) {
  const cleanedNamespace = sanitizeSegment(namespace);
  const cleanedId = sanitizeSegment(id);
  if (!cleanedNamespace) {
    throw new Error("namespace resolved to an empty cron sentinel prefix");
  }
  if (!cleanedId) {
    throw new Error("job id resolved to an empty cron sentinel suffix");
  }
  return `# native-scheduler:${cleanedNamespace}:${cleanedId}`;
}

export function intervalToCron(seconds: number | undefined): string {
  if (seconds === undefined) {
    return "@reboot";
  }
  if (seconds < 60) {
    return "* * * * *";
  }
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `*/${minutes} * * * *`;
  }
  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return `0 */${hours} * * *`;
  }
  return "0 0 * * *";
}

function buildCronCommand(job: CronJobInput): string {
  let prefix = "";
  if (job.environment && Object.keys(job.environment).length > 0) {
    const envParts = Object.entries(job.environment).map(
      ([key, value]) => `${key}=${shellEscape(value)}`,
    );
    prefix = `${envParts.join(" ")} `;
  }
  return `${prefix}${job.command.map(shellEscape).join(" ")}`;
}

function shellEscape(value: string): string {
  if (/^[a-zA-Z0-9_./:=@-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function parseCrontab(content: string) {
  return content.split(/\r?\n/);
}

function removeSentinelEntry(lines: string[], sentinel: string): string[] {
  const result: string[] = [];
  let skipNext = false;
  for (const line of lines) {
    if (line === sentinel) {
      skipNext = true;
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    result.push(line);
  }
  return result;
}

export function createCronAdapter(options: CronAdapterOptions) {
  const platform = options.deps?.platform ?? process.platform;
  const execCrontab = options.deps?.execCrontab ?? defaultExecCrontab;
  const spawnDirect = options.deps?.spawnDirect ?? defaultSpawnDirect;

  if (platform === "win32") {
    throw new Error("cron adapter is not available on Windows");
  }

  async function readCrontab(): Promise<string> {
    const result = await execCrontab(["-l"]);
    if (result.code !== 0) {
      // No crontab is not an error, just empty
      if (result.stderr.includes("no crontab")) {
        return "";
      }
      return "";
    }
    return result.stdout;
  }

  async function writeCrontab(content: string): Promise<void> {
    const result = await execCrontab(["-"], content);
    if (result.code !== 0) {
      throw new Error(`crontab write failed: ${result.stderr || result.stdout}`);
    }
  }

  return {
    async list() {
      const content = await readCrontab();
      const lines = parseCrontab(content);
      const prefix = `# native-scheduler:${sanitizeSegment(options.namespace)}:`;
      const ids: string[] = [];

      for (const line of lines) {
        if (line.startsWith(prefix)) {
          ids.push(line.slice(prefix.length));
        }
      }

      ids.sort();
      return {
        backend: "cron",
        jobs: ids.map((id) => ({
          id,
          sentinel: buildSentinel(options.namespace, id),
        })),
      };
    },

    async get(id: string) {
      const sentinel = buildSentinel(options.namespace, id);
      const content = await readCrontab();
      const lines = parseCrontab(content);
      const sentinelIndex = lines.indexOf(sentinel);

      return {
        id,
        sentinel,
        exists: sentinelIndex !== -1,
        cronLine: sentinelIndex !== -1 ? lines[sentinelIndex + 1] : undefined,
      };
    },

    async upsert(job: CronJobInput) {
      if (!job.command.length) {
        throw new Error("job.command must contain at least one item");
      }

      const sentinel = buildSentinel(options.namespace, job.id);
      const cronExpr = intervalToCron(job.startIntervalSeconds);
      const cronLine = `${cronExpr} ${buildCronCommand(job)}`;

      const content = await readCrontab();
      let lines = parseCrontab(content);

      // Remove existing entry if present
      lines = removeSentinelEntry(lines, sentinel);

      // Remove trailing empty lines, add entry, ensure trailing newline
      while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }

      lines.push(sentinel);
      lines.push(cronLine);
      lines.push("");

      await writeCrontab(lines.join("\n"));

      return {
        changed: true,
        sentinel,
        cronLine,
      };
    },

    async remove(id: string) {
      const sentinel = buildSentinel(options.namespace, id);
      const content = await readCrontab();
      let lines = parseCrontab(content);
      lines = removeSentinelEntry(lines, sentinel);
      await writeCrontab(lines.join("\n"));

      return {
        removed: true,
        id,
        sentinel,
      };
    },

    async run(id: string) {
      // For cron, "run" means execute the command directly
      const sentinel = buildSentinel(options.namespace, id);
      const content = await readCrontab();
      const lines = parseCrontab(content);
      const sentinelIndex = lines.indexOf(sentinel);

      if (sentinelIndex === -1 || sentinelIndex + 1 >= lines.length) {
        throw new Error(`No cron entry found for job ${id}`);
      }

      const cronLine = lines[sentinelIndex + 1]!;
      // Strip the cron schedule part (first 5 fields or @keyword)
      let commandPart: string;
      if (cronLine.startsWith("@")) {
        commandPart = cronLine.replace(/^@\S+\s+/, "");
      } else {
        // Skip 5 cron fields
        const parts = cronLine.split(/\s+/);
        commandPart = parts.slice(5).join(" ");
      }

      const result = await spawnDirect(["sh", "-c", commandPart]);
      if (result.code !== 0) {
        throw new Error(`Direct execution failed with code ${result.code}`);
      }

      return {
        started: true,
        id,
        sentinel,
      };
    },

    async enable(id: string) {
      const sentinel = buildSentinel(options.namespace, id);
      const content = await readCrontab();
      const lines = parseCrontab(content);
      const sentinelIndex = lines.indexOf(sentinel);

      if (sentinelIndex === -1 || sentinelIndex + 1 >= lines.length) {
        throw new Error(`No cron entry found for job ${id}`);
      }

      const cronLine = lines[sentinelIndex + 1]!;
      if (cronLine.startsWith("#DISABLED ")) {
        lines[sentinelIndex + 1] = cronLine.slice("#DISABLED ".length);
        await writeCrontab(lines.join("\n"));
      }

      return {
        enabled: true,
        id,
        sentinel,
      };
    },

    async disable(id: string) {
      const sentinel = buildSentinel(options.namespace, id);
      const content = await readCrontab();
      const lines = parseCrontab(content);
      const sentinelIndex = lines.indexOf(sentinel);

      if (sentinelIndex === -1 || sentinelIndex + 1 >= lines.length) {
        throw new Error(`No cron entry found for job ${id}`);
      }

      const cronLine = lines[sentinelIndex + 1]!;
      if (!cronLine.startsWith("#DISABLED ")) {
        lines[sentinelIndex + 1] = `#DISABLED ${cronLine}`;
        await writeCrontab(lines.join("\n"));
      }

      return {
        disabled: true,
        id,
        sentinel,
      };
    },
  };
}
