import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/', '**/dist/', '**/coverage/', '.claude/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Web app: browser code, with TypeScript inside .svelte files.
  {
    files: ['apps/web/**/*.{ts,svelte}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['apps/web/**/*.svelte', 'apps/web/**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  // API layering: routes -> services -> repositories (docs/technical-decisions.md §2).
  {
    files: ['apps/api/src/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['drizzle-orm', 'drizzle-orm/*', 'better-sqlite3', '**/db/**'],
              message: 'Routes never touch the database or Drizzle; call a service.',
            },
            {
              group: ['**/repositories/**'],
              message: 'Routes must not skip the service layer; call a service.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['hono', 'hono/*', '@hono/*', '**/routes/**', '**/middleware/**'],
              message: 'Services are HTTP-agnostic; they throw AppErrors instead.',
            },
            {
              group: ['drizzle-orm', 'drizzle-orm/*', 'better-sqlite3', '**/db/**'],
              message: 'Services never touch Drizzle; call a repository.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/repositories/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['hono', 'hono/*', '@hono/*', '**/errors', '**/errors.js', '**/middleware/**'],
              message: 'Repositories never throw HTTP errors; let the service translate.',
            },
            {
              group: ['**/routes/**', '**/services/**'],
              message: 'Repositories sit at the bottom of the stack and import no upper layer.',
            },
          ],
        },
      ],
    },
  },
  prettier,
  ...svelte.configs['flat/prettier'],
);
