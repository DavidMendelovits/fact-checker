import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

// We build content.ts and popup.ts as separate self-contained bundles.
// Using lib mode per entry prevents Rollup from creating shared chunks
// with hashed filenames that the extension manifest cannot reference.

const entry = process.env.VITE_ENTRY ?? "content";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: entry === "content", // only clean on first build
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, `src/${entry}.ts`),
      name: entry,
      formats: ["es"],
      fileName: () => `${entry}.js`,
    },
    rollupOptions: {
      output: {
        // Inline all imports into single file — no shared chunks
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      "@citecast/shared": resolve(__dirname, "../../packages/shared/types.ts"),
    },
  },
  plugins: [
    {
      name: "copy-content-css",
      closeBundle() {
        if (entry === "content") {
          try {
            mkdirSync(resolve(__dirname, "dist"), { recursive: true });
            // Copy the CSS so the manifest entry resolves (even though shadow DOM
            // inlines its own copy via ?raw; this file is a no-op in practice)
            copyFileSync(
              resolve(__dirname, "styles/content.css"),
              resolve(__dirname, "dist/content.css")
            );
          } catch (e) {
            console.warn("Could not copy content.css:", e);
          }
        }
      },
    },
  ],
});
