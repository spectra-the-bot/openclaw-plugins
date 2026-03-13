import { describe, expect, it } from "vitest";
import {
  detectNativeSchedulerBackend,
  getBackendStatus,
  getConfiguredBackend,
  getDefaultNamespace,
} from "../src/backend.js";

describe("backend selection", () => {
  it("prefers explicit request over config", () => {
    const backend = getConfiguredBackend({ defaultBackend: "cron" }, "launchd");
    expect(backend).toBe("launchd");
  });

  it("uses config when requested backend is auto", () => {
    const backend = getConfiguredBackend({ defaultBackend: "systemd" }, "auto");
    expect(backend).toBe("systemd");
  });

  it("falls back to platform detection", () => {
    const backend = getConfiguredBackend(undefined, "auto");
    expect(backend).toBe(detectNativeSchedulerBackend());
  });

  it("resolves default namespace", () => {
    expect(getDefaultNamespace()).toBe("dev.openclaw.native-scheduler");
    expect(getDefaultNamespace({ namespace: "  custom.ns  " })).toBe("custom.ns");
  });

  it("reports backend status shape", () => {
    const status = getBackendStatus("launchd", "example");
    expect(status.backend).toBe("launchd");
    expect(status.namespace).toBe("example");
    expect(status.implemented.launchd).toBe(true);
  });
});
