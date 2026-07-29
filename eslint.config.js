import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.codegraph/**",
      "**/.tmp-chrome-ui-shots/**",
      "**/workspace/**",
      "**/*.tsbuildinfo",
      "**/.venv/**",
      "**/__pycache__/**"
    ]
  },
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["apps/desktop/src/preload/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node
    }
  }
];
