import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Config for running server modules under vite-node outside SolidStart.
// "server-only" is a SolidStart virtual module; here it is an empty file.
export default defineConfig({
  resolve: {
    alias: [
      { find: "~", replacement: fileURLToPath(new URL("../src", import.meta.url)) },
      {
        find: "server-only",
        replacement: fileURLToPath(new URL("./server-only-shim.ts", import.meta.url)),
      },
    ],
  },
});
