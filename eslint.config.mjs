import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Separate Python/Django project living in this repo — not part of the
      // Next.js app and not meant to be linted by ESLint.
      "studex-backend/**",
    ],
  },
];

export default eslintConfig;
