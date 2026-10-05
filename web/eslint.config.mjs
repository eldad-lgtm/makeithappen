import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // PLAN.md §7.5 — `core/` is pure domain logic. It may not import from
  // channels/, db/, jobs/, messages/, observability/, engine/, app/, or any
  // I/O library. Enforced here, not by good intentions.
  {
    files: ["src/core/**/*.{ts,tsx}"],
    ignores: ["src/core/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/channels/*",
                "@/db/*",
                "@/jobs/*",
                "@/messages/*",
                "@/observability/*",
                "@/engine/*",
                "@/app/*",
                "@/lib/*",
                "../channels/*",
                "../db/*",
                "../jobs/*",
                "../messages/*",
                "../observability/*",
                "../engine/*",
                "../app/*",
                "../lib/*",
                "next",
                "next/*",
                "react",
                "react/*",
                "react-dom",
                "@supabase/*",
                "node:*",
                "fs",
                "crypto",
                "path",
              ],
              message:
                "core/ must stay pure: no I/O, no framework, no infrastructure imports (PLAN.md §7.5).",
            },
          ],
        },
      ],
    },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**"]),
]);

export default eslintConfig;
