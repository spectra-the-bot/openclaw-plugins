export type NativeSchedulerBackend = "launchd" | "cron" | "systemd" | "windows-task-scheduler";

const DEFAULT_NAMESPACE = "dev.openclaw.native-scheduler";

export function detectNativeSchedulerBackend(): NativeSchedulerBackend | "unknown" {
  switch (process.platform) {
    case "darwin":
      return "launchd";
    case "linux":
      return "systemd";
    case "win32":
      return "windows-task-scheduler";
    default:
      return "unknown";
  }
}

export function getConfiguredBackend(
  pluginConfig: Record<string, unknown> | undefined,
  requested?: NativeSchedulerBackend | "auto",
): NativeSchedulerBackend | "unknown" {
  if (requested && requested !== "auto") {
    return requested;
  }

  const configured = pluginConfig?.defaultBackend;
  if (typeof configured === "string" && configured !== "auto") {
    return configured as NativeSchedulerBackend;
  }

  return detectNativeSchedulerBackend();
}

export function getDefaultNamespace(pluginConfig?: Record<string, unknown>) {
  const configured = pluginConfig?.namespace;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  return DEFAULT_NAMESPACE;
}

export function getBackendStatus(backend: string, namespace: string) {
  return {
    platform: process.platform,
    pid: process.pid,
    backend,
    namespace,
    supportedBackends: {
      darwin: "launchd",
      linux: ["systemd", "cron"],
      win32: "windows-task-scheduler",
    },
    implemented: {
      launchd: true,
      cron: true,
      systemd: true,
      "windows-task-scheduler": true,
    },
  };
}
