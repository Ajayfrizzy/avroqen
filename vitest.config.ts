import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/{unit,integration,adversarial}/**/*.test.ts"],
    testTimeout: 10000,
  },
});
