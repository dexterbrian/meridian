import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

// `vite build` targets Node. `vite build --mode vercel` targets Vercel (the
// production host, see TRD 1.1). `vite build --mode workers` targets Cloudflare Workers.
export default defineConfig(({ command, mode }) => {
  // In dev, make .env / .env.local visible to server code through process.env.
  // In production the host provides the variables.
  if (command === "serve") {
    for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
      process.env[key] ??= value;
    }
  }
  return config(mode);
});

const config = (mode: string) => ({
  resolve: {
    alias: [
      { find: "~", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // @supabase/ssr imports the CommonJS `cookie` package. Bundled for the server,
      // it causes a circular chunk import that crashes the production build.
      // cookie-es has the same parse and serialize as a plain ES module.
      { find: /^cookie$/, replacement: "cookie-es" },
    ],
  },
  // SolidStart's dev error overlay imports a CommonJS source-map helper that
  // Vite must pre-bundle, or the overlay itself fails to load.
  optimizeDeps: { include: ["@jridgewell/trace-mapping"] },
  plugins: [
    solidStart({ middleware: "./src/middleware.ts" }),
    tailwindcss(),
    nitro(
      mode === "workers"
        ? {
            preset: "cloudflare_module",
            cloudflare: { deployConfig: true, nodeCompat: true },
          }
        : mode === "vercel"
          ? { preset: "vercel" }
          : {},
    ),
  ],
});
