import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", ".expo/**", "android/**", "ios/**", "expo-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-require-imports": [
        "error",
        { allow: ["\\.(png|jpg)$"] },
      ],
    },
  },
  {
    files: ["metro.config.js", "plugins/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { __dirname: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": [
        "error",
        { allow: ["^expo/metro-config$", "^expo/config-plugins$", "^node:path$", "^node:os$"] },
      ],
    },
  },
);
