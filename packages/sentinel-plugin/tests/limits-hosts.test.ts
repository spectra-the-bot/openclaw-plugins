import { describe, expect, it } from "vitest";
import { assertHostAllowed } from "../src/limits.js";

const config = {
  allowedHosts: ["api.github.com", "api.github.com:443", "example.com"],
  localDispatchBase: "http://127.0.0.1:18789",
  limits: {
    maxWatchersTotal: 10,
    maxWatchersPerSkill: 5,
    maxConditionsPerWatcher: 10,
    maxIntervalMsFloor: 1000,
  },
};

describe("allowed host normalization", () => {
  it("allows canonical host and host:port", () => {
    expect(() => assertHostAllowed(config as any, "https://api.github.com/events")).not.toThrow();
    expect(() =>
      assertHostAllowed(config as any, "https://api.github.com:443/events"),
    ).not.toThrow();
  });

  it("rejects non-allowlisted host", () => {
    expect(() => assertHostAllowed(config as any, "https://evil.example.net")).toThrow(
      "Host not allowed",
    );
  });
});
