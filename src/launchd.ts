import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

type CalendarEntry = {
  minute?: number;
  hour?: number;
  day?: number;
  weekday?: number;
  month?: number;
};

type LaunchdJobInput = {
  id: string;
  description?: string;
  command: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  runAtLoad?: boolean;
  startIntervalSeconds?: number;
  calendar?: CalendarEntry[];
  stdoutPath?: string;
  stderrPath?: string;
  disabled?: boolean;
};

type PluginLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

type LaunchdAdapterOptions = {
  namespace: string;
  logger?: PluginLogger;
};

type LaunchctlResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type LaunchdManagedJob = {
  id: string;
  label: string;
  filePath: string;
  loaded: boolean;
  disabled: boolean;
  exists: boolean;
  rawPrint?: string;
};

function assertDarwin() {
  if (process.platform !== "darwin") {
    throw new Error("launchd adapter is only available on macOS");
  }
}

function getUserDomain() {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined) {
    throw new Error("Unable to determine current macOS uid for launchctl domain");
  }
  return `gui/${uid}`;
}

function sanitizeSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildLabel(namespace: string, id: string) {
  const cleanedNamespace = sanitizeSegment(namespace);
  const cleanedId = sanitizeSegment(id);
  if (!cleanedNamespace) {
    throw new Error("namespace resolved to an empty launchd label prefix");
  }
  if (!cleanedId) {
    throw new Error("job id resolved to an empty launchd label suffix");
  }
  return `${cleanedNamespace}.${cleanedId}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlValue(value: string | number | boolean) {
  if (typeof value === "boolean") {
    return value ? "<true/>" : "<false/>";
  }
  if (typeof value === "number") {
    return `<integer>${value}</integer>`;
  }
  return `<string>${escapeXml(value)}</string>`;
}

function xmlArray(values: string[]) {
  return `<array>${values.map((value) => xmlValue(value)).join("")}</array>`;
}

function xmlDict(entries: [string, string][]) {
  return `<dict>${entries
    .map(([key, value]) => `<key>${escapeXml(key)}</key>${value}`)
    .join("")}</dict>`;
}

function toCalendarDict(entry: CalendarEntry) {
  const pairs: [string, string][] = [];
  if (entry.minute !== undefined) pairs.push(["Minute", xmlValue(entry.minute)]);
  if (entry.hour !== undefined) pairs.push(["Hour", xmlValue(entry.hour)]);
  if (entry.day !== undefined) pairs.push(["Day", xmlValue(entry.day)]);
  if (entry.weekday !== undefined) pairs.push(["Weekday", xmlValue(entry.weekday)]);
  if (entry.month !== undefined) pairs.push(["Month", xmlValue(entry.month)]);
  if (pairs.length === 0) {
    throw new Error("calendar entries must set at least one of minute/hour/day/weekday/month");
  }
  return xmlDict(pairs);
}

function renderPlist(label: string, job: LaunchdJobInput) {
  const entries: [string, string][] = [
    ["Label", xmlValue(label)],
    ["ProgramArguments", xmlArray(job.command)],
  ];

  if (job.runAtLoad !== undefined) entries.push(["RunAtLoad", xmlValue(job.runAtLoad)]);
  if (job.startIntervalSeconds !== undefined) {
    entries.push(["StartInterval", xmlValue(job.startIntervalSeconds)]);
  }
  if (job.calendar?.length) {
    entries.push([
      "StartCalendarInterval",
      job.calendar.length === 1
        ? toCalendarDict(job.calendar[0]!)
        : `<array>${job.calendar.map((entry) => toCalendarDict(entry)).join("")}</array>`,
    ]);
  }
  if (job.workingDirectory) {
    entries.push(["WorkingDirectory", xmlValue(job.workingDirectory)]);
  }
  if (job.environment && Object.keys(job.environment).length > 0) {
    entries.push([
      "EnvironmentVariables",
      xmlDict(Object.entries(job.environment).map(([key, value]) => [key, xmlValue(value)])),
    ]);
  }
  if (job.stdoutPath) entries.push(["StandardOutPath", xmlValue(job.stdoutPath)]);
  if (job.stderrPath) entries.push(["StandardErrorPath", xmlValue(job.stderrPath)]);
  entries.push(["KeepAlive", xmlValue(false)]);
  entries.push(["Disabled", xmlValue(Boolean(job.disabled))]);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">${xmlDict(entries)}</plist>
`;
}

async function execLaunchctl(args: string[]): Promise<LaunchctlResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("launchctl", args, {
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

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function createLaunchdAdapter(options: LaunchdAdapterOptions) {
  assertDarwin();

  const userDomain = getUserDomain();
  const agentsDir = path.join(os.homedir(), "Library", "LaunchAgents");

  function logInfo(message: string, extra?: unknown) {
    const suffix = extra === undefined ? "" : ` ${JSON.stringify(extra)}`;
    options.logger?.info?.(`[native-scheduler] ${message}${suffix}`);
  }

  function resolveLabel(id: string) {
    return buildLabel(options.namespace, id);
  }

  function resolvePlistPath(id: string) {
    return path.join(agentsDir, `${resolveLabel(id)}.plist`);
  }

  async function printService(label: string) {
    const result = await execLaunchctl(["print", `${userDomain}/${label}`]);
    if (result.code !== 0) {
      return null;
    }
    return result.stdout;
  }

  async function getDisabledMap() {
    const result = await execLaunchctl(["print-disabled", userDomain]);
    if (result.code !== 0) {
      return {} as Record<string, boolean>;
    }

    const map: Record<string, boolean> = {};
    for (const line of result.stdout.split(/\r?\n/)) {
      const match = line.match(/"([^"]+)"\s*=\s*(true|false);/);
      if (!match) continue;
      map[match[1]!] = match[2] === "true";
    }
    return map;
  }

  async function summarize(id: string): Promise<LaunchdManagedJob> {
    const label = resolveLabel(id);
    const filePath = resolvePlistPath(id);
    const exists = await pathExists(filePath);
    const rawPrint = await printService(label);
    const disabledMap = await getDisabledMap();
    return {
      id,
      label,
      filePath,
      exists,
      loaded: rawPrint !== null,
      disabled: disabledMap[label] ?? false,
      rawPrint: rawPrint ?? undefined,
    };
  }

  async function unloadIfPresent(id: string) {
    const filePath = resolvePlistPath(id);
    const result = await execLaunchctl(["bootout", userDomain, filePath]);
    if (result.code !== 0) {
      const text = `${result.stdout}\n${result.stderr}`;
      if (!text.includes("No such process") && !text.includes("could not find service")) {
        logInfo(`bootout returned non-zero for ${id}`, result);
      }
    }
  }

  return {
    async list() {
      await fs.mkdir(agentsDir, { recursive: true });
      const entries = await fs.readdir(agentsDir, { withFileTypes: true });
      const prefix = `${sanitizeSegment(options.namespace)}.`;
      const ids = entries
        .filter(
          (entry) =>
            entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".plist"),
        )
        .map((entry) => entry.name.slice(prefix.length, -".plist".length))
        .sort();

      const jobs = await Promise.all(ids.map((id) => summarize(id)));
      return {
        backend: "launchd",
        userDomain,
        agentsDir,
        jobs,
      };
    },

    async get(id: string) {
      return await summarize(id);
    },

    async upsert(job: LaunchdJobInput) {
      if (!job.command.length) {
        throw new Error("job.command must contain at least one item");
      }
      await fs.mkdir(agentsDir, { recursive: true });
      const label = resolveLabel(job.id);
      const filePath = resolvePlistPath(job.id);
      const plist = renderPlist(label, job);
      await fs.writeFile(filePath, plist, "utf8");
      await unloadIfPresent(job.id);
      const bootstrap = await execLaunchctl(["bootstrap", userDomain, filePath]);
      if (bootstrap.code !== 0) {
        throw new Error(`launchctl bootstrap failed: ${bootstrap.stderr || bootstrap.stdout}`);
      }
      if (job.disabled) {
        await execLaunchctl(["disable", `${userDomain}/${label}`]);
      } else {
        await execLaunchctl(["enable", `${userDomain}/${label}`]);
      }
      return {
        changed: true,
        label,
        filePath,
        summary: await summarize(job.id),
      };
    },

    async remove(id: string) {
      const label = resolveLabel(id);
      const filePath = resolvePlistPath(id);
      await unloadIfPresent(id);
      await fs.rm(filePath, { force: true });
      return {
        removed: true,
        id,
        label,
        filePath,
      };
    },

    async run(id: string) {
      const label = resolveLabel(id);
      const result = await execLaunchctl(["kickstart", "-k", `${userDomain}/${label}`]);
      if (result.code !== 0) {
        throw new Error(`launchctl kickstart failed: ${result.stderr || result.stdout}`);
      }
      return {
        started: true,
        id,
        label,
      };
    },

    async enable(id: string) {
      const label = resolveLabel(id);
      const result = await execLaunchctl(["enable", `${userDomain}/${label}`]);
      if (result.code !== 0) {
        throw new Error(`launchctl enable failed: ${result.stderr || result.stdout}`);
      }
      return {
        enabled: true,
        id,
        label,
        summary: await summarize(id),
      };
    },

    async disable(id: string) {
      const label = resolveLabel(id);
      const result = await execLaunchctl(["disable", `${userDomain}/${label}`]);
      if (result.code !== 0) {
        throw new Error(`launchctl disable failed: ${result.stderr || result.stdout}`);
      }
      return {
        disabled: true,
        id,
        label,
        summary: await summarize(id),
      };
    },
  };
}
