import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@citecast/shared": path.resolve(__dirname, "../../packages/shared/types.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
