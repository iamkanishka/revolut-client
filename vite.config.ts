import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      include: ["src"],
      exclude: ["src/**/*.test.ts"],
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "merchant/index": resolve(__dirname, "src/merchant/index.ts"),
        "business/index": resolve(__dirname, "src/business/index.ts"),
        "openbanking/index": resolve(__dirname, "src/openbanking/index.ts"),
        "cryptoramp/index": resolve(__dirname, "src/cryptoramp/index.ts"),
        "cryptoexchange/index": resolve(__dirname, "src/cryptoexchange/index.ts"),
        "webhook/index": resolve(__dirname, "src/webhook/index.ts"),
      },
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [],
      output: {
        preserveModules: false,
        globals: {},
      },
    },
    target: "es2022",
    sourcemap: true,
    minify: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
