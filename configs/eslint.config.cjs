// CommonJS on purpose: eslint runs via the pre-commit hook in its own isolated environment
// (see .pre-commit-config.yaml), where these packages are only reachable through the NODE_PATH
// pre-commit sets — which require() honors but ESM import does not. There is no eslint in the
// app's own devDependencies.
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ignores: ["dist/", "coverage/", "storybook-static/", "test-results/", "playwright-report/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // CommonJS config files (this one and configs/prettier.config.cjs) use CJS globals
    // and require() by definition.
    files: ["**/*.cjs"],
    languageOptions: { globals: { module: "writable", require: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
