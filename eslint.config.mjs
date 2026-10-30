import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Type-aware linting uses the TypeScript 6 API because TypeScript 7 does not
 * ship a compiler API yet. `@typescript/native` provides the TypeScript 7 `tsc`
 * binary; `typescript` is the official compatibility alias for tooling.
 */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src-tauri/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
