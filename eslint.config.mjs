import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Type-aware linting uses the TypeScript 6 API because TypeScript 7 does not
 * ship a compiler API yet. `@typescript/native` provides the TypeScript 7 `tsc`
 * binary; `typescript` is the official compatibility alias for tooling.
 */

const integrationMessage =
  "Integration modules are wiring only. Move the logic into src/features, src/model or src/io; see ADR 0008.";

const canvasMessage =
  "Canvas helpers must not import CanvasView. Keep the shared logic in a canvas helper or src/model; see ADR 0008.";

/** Files that predate the 700-line budget. This list must shrink, never grow. */
const LEGACY_LARGE_FILES = [
  "src/app/App.ts",
  "src/canvas/CanvasView.ts",
  "src/canvas/editors.ts",
  "src/features/schematics/model/sheetTemplate.ts",
  "src/i18n/types.generated.ts",
  "src/io/projectFile.ts",
  "src/model/labelLayout.ts",
  "src/pdf/pdfExport.ts",
  "src/state/store.ts",
  "src/ui/dialogs.ts",
  "src/ui/markupsPanel.ts",
  "src/ui/selectionInspector.ts",
  "src/ui/toolFlyouts.ts",
];

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
      "max-lines": ["warn", { max: 700, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["src/features/**/*.ts", "src/model/**/*.ts", "src/io/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/app/App"], message: integrationMessage },
            { group: ["**/canvas/CanvasView"], message: integrationMessage },
          ],
        },
      ],
    },
  },
  {
    files: ["src/ui/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/app/App"], message: integrationMessage },
            {
              group: ["**/canvas/CanvasView"],
              allowTypeImports: true,
              message: integrationMessage,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/canvas/**/*.ts"],
    ignores: ["src/canvas/CanvasView.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/app/App"], message: integrationMessage },
            { group: ["**/canvas/CanvasView"], message: canvasMessage },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "max-lines": "off",
    },
  },
  {
    files: LEGACY_LARGE_FILES,
    rules: {
      "max-lines": "off",
    },
  },
);
