/* eslint-disable no-restricted-properties */
import { readFileSync } from "node:fs";

// Local settings for the browser tests. .env.local (local dev) wins over .env (production).
export function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const i = line.indexOf("=");
        if (i < 1 || line.startsWith("#")) continue;
        const k = line.slice(0, i).trim();
        if (!process.env[k])
          process.env[k] = line
            .slice(i + 1)
            .trim()
            .replace(/^"|"$/g, "");
      }
    } catch {
      /* optional */
    }
  }
}
