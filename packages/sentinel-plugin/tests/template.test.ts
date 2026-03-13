import { describe, expect, it } from "vitest";
import { renderTemplate } from "../src/template.js";

describe("template", () => {
  it("includes unresolved placeholder in error", () => {
    expect(() => renderTemplate({ x: "${payload.missing}" }, { payload: {} })).toThrow(
      "Template placeholder unresolved: ${payload.missing}",
    );
  });
});
