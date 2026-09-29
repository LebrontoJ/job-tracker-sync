import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "scripts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, chrome: "readonly" } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // core/ must stay pure: no Chrome APIs, no DOM.
    files: ["src/core/**/*.ts"],
    languageOptions: { globals: { chrome: "off" } },
    rules: {
      "no-restricted-globals": ["error", "chrome", "document", "window", "localStorage"],
    },
  },
);
