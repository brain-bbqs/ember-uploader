import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "storybook-static/", "test-results/", "playwright-report/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // CommonJS config files (configs/prettier.config.cjs) use CJS globals.
    files: ["**/*.cjs"],
    languageOptions: { globals: { module: "writable", require: "readonly" } },
  },
);
