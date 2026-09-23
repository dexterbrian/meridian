import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import solid from "eslint-plugin-solid/configs/typescript";
import globals from "globals";
import tseslint from "typescript-eslint";

// The service-role Supabase client bypasses RLS. Only code under src/server may import it.
const serviceKeyRule = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["~/server/supabase", "**/server/supabase", "**/server/supabase.ts"],
          message: "The service-role client may only be imported under src/server.",
        },
      ],
    },
  ],
  "no-restricted-properties": [
    "error",
    {
      object: "process",
      property: "env",
      message: "Read server config through src/server/env.ts.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".nitro", "node_modules", "src/lib/database.types.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    ...solid,
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parser: tseslint.parser,
    },
    rules: {
      ...solid.rules,
      ...serviceKeyRule,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Server code and build config may use the service client and process.env.
    files: ["src/server/**/*.ts", "vite.config.ts", "vitest.config.ts", "src/**/*.test.ts"],
    rules: { "no-restricted-imports": "off", "no-restricted-properties": "off" },
  },
  eslintPluginPrettier,
);
