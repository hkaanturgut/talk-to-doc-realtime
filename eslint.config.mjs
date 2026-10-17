import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const serverImportBan = {
  patterns: [
    {
      group: ["@/server/*", "@/server", "**/server/*"],
      message: "Browser code must not import server modules (secrets, Azure). Use src/shared.",
    },
  ],
};

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      ".specify/**",
      ".claude/**",
    ],
  },
  {
    files: ["src/client/**", "src/components/**", "src/hooks/**"],
    rules: { "no-restricted-imports": ["error", serverImportBan] },
  },
];

export default config;
