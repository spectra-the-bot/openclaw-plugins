import { spawn } from "node:child_process";

export type WintaskJobInput = {
  id: string;
  description?: string;
  command: string[];
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

export type WintaskAdapterDeps = {
  platform?: string;
  execSchtasks?: (args: string[]) => Promise<ExecResult>;
};

type WintaskAdapterOptions = {
  namespace: string;
  logger?: PluginLogger;
  deps?: WintaskAdapterDeps;
};

function defaultExecSchtasks(args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("schtasks", args, {
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

export function buildTaskName(namespace: string, id: string) {
  const cleanedNamespace = sanitizeSegment(namespace);
  const cleanedId = sanitizeSegment(id);
  if (!cleanedNamespace) {
    throw new Error("namespace resolved to an empty task name prefix");
  }
  if (!cleanedId) {
    throw new Error("job id resolved to an empty task name suffix");
  }
  return `\\NativeScheduler\\${cleanedNamespace}\\${cleanedId}`;
}

function intervalToSchedule(seconds: number | undefined): { sc: string; mo?: string } {
  if (seconds === undefined) {
    return { sc: "ONCE" };
  }
  if (seconds < 3600) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return { sc: "MINUTE", mo: String(minutes) };
  }
  if (seconds < 86400) {
    const hours = Math.max(1, Math.round(seconds / 3600));
    return { sc: "HOURLY", mo: String(hours) };
  }
  return { sc: "DAILY", mo: "1" };
}

function buildTaskCommand(job: WintaskJobInput): string {
  return job.command.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ");
}

export function createWintaskAdapter(options: WintaskAdapterOptions) {
  const platform = options.deps?.platform ?? process.platform;
  const execSchtasks = options.deps?.execSchtasks ?? defaultExecSchtasks;

  if (platform !== "win32") {
    throw new Error("Windows Task Scheduler adapter is only available on Windows");
  }

  function resolveTaskName(id: string) {
    return buildTaskName(options.namespace, id);
  }

  return {
    async list() {
      const result = await execSchtasks(["/Query", "/FO", "CSV", "/NH"]);
      const prefix = `\\NativeScheduler\\${sanitizeSegment(options.namespace)}\\`;
      const ids: string[] = [];

      for (const line of result.stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        // CSV format: "TaskName","Next Run Time","Status"
        const match = line.match(/^"([^"]+)"/);
        if (match) {
          const taskName = match[1]!;
          if (taskName.startsWith(prefix)) {
            ids.push(taskName.slice(prefix.length));
          }
        }
      }

      ids.sort();
      return {
        backend: "windows-task-scheduler",
        jobs: ids.map((id) => ({
          id,
          taskName: resolveTaskName(id),
        })),
      };
    },

    async get(id: string) {
      const taskName = resolveTaskName(id);
      const result = await execSchtasks(["/Query", "/TN", taskName, "/FO", "CSV", "/NH"]);
      return {
        id,
        taskName,
        exists: result.code === 0,
      };
    },

    async upsert(job: WintaskJobInput) {
      if (!job.command.length) {
        throw new Error("job.command must contain at least one item");
      }

      const taskName = resolveTaskName(job.id);
      const schedule = intervalToSchedule(job.startIntervalSeconds);
      const tr = buildTaskCommand(job);

      const args = ["/Create", "/F", "/SC", schedule.sc, "/TN", taskName, "/TR", tr];
      if (schedule.mo) {
        args.push("/MO", schedule.mo);
      }

      const result = await execSchtasks(args);
      if (result.code !== 0) {
        throw new Error(`schtasks /Create failed: ${result.stderr || result.stdout}`);
      }

      if (job.disabled) {
        await execSchtasks(["/Change", "/TN", taskName, "/DISABLE"]);
      }

      return {
        changed: true,
        taskName,
      };
    },

    async remove(id: string) {
      const taskName = resolveTaskName(id);
      const result = await execSchtasks(["/Delete", "/F", "/TN", taskName]);
      if (result.code !== 0) {
        throw new Error(`schtasks /Delete failed: ${result.stderr || result.stdout}`);
      }

      return {
        removed: true,
        id,
        taskName,
      };
    },

    async run(id: string) {
      const taskName = resolveTaskName(id);
      const result = await execSchtasks(["/Run", "/TN", taskName]);
      if (result.code !== 0) {
        throw new Error(`schtasks /Run failed: ${result.stderr || result.stdout}`);
      }

      return {
        started: true,
        id,
        taskName,
      };
    },

    async enable(id: string) {
      const taskName = resolveTaskName(id);
      const result = await execSchtasks(["/Change", "/TN", taskName, "/ENABLE"]);
      if (result.code !== 0) {
        throw new Error(`schtasks /Change failed: ${result.stderr || result.stdout}`);
      }

      return {
        enabled: true,
        id,
        taskName,
      };
    },

    async disable(id: string) {
      const taskName = resolveTaskName(id);
      const result = await execSchtasks(["/Change", "/TN", taskName, "/DISABLE"]);
      if (result.code !== 0) {
        throw new Error(`schtasks /Change failed: ${result.stderr || result.stdout}`);
      }

      return {
        disabled: true,
        id,
        taskName,
      };
    },
  };
}
