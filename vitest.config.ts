import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "build/**", "src/__tests__/fixtures/**"],
  },
});
