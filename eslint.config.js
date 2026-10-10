import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "supabase/functions", ".agents", "Scratchpad", "e2e", "playwright.config.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // `.select('*')` once pulled ~17MB of base64 photos per refresh and exhausted
    // the Supabase egress quota. List columns explicitly; if a wildcard is truly
    // unavoidable, disable this rule on that line with a reason.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Match the argument node so the error (and any disable comment) sits on
          // the `.select(...)` line, not the first line of a multi-line chain.
          selector: "CallExpression[callee.property.name='select'] > Literal.arguments:first-child[value='*']",
          message: "No .select('*'): list columns explicitly to bound Supabase egress.",
        },
        {
          selector: "CallExpression[callee.property.name='select'] > TemplateLiteral.arguments:first-child[quasis.0.value.raw='*']",
          message: "No .select(`*`): list columns explicitly to bound Supabase egress.",
        },
      ],
    },
  },
);
