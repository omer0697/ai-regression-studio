import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Point workspace imports at TS sources during tests (no build needed).
      "@ars/shared-contracts": fileURLToPath(
        new URL("../../packages/shared-contracts/src/index.ts", import.meta.url),
      ),
    },
  },
});
