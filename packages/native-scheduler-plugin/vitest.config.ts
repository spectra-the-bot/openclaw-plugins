import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Wrapper tests spawn real subprocesses (openclaw system event, etc.)
    // and can be slow on CI runners — bump the default timeout.
    testTimeout: 30_000,
  },
});
