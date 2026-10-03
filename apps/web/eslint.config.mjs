import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Architecture rules (docs/engineering-rules.md) enforced by lint:
 *  - components/ui = design system: presentational only, no data fetching or feature imports
 *  - app/ = routes: thin server components, no data fetching
 *  - features talk to each other only through their public index (`@/features/<name>`)
 *  - network access only through src/lib/api.ts
 */
const config = [
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Use the client in src/lib/api.ts (CSRF header, error envelope, offline handling).' }],
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/features/*/*'], message: 'Import other features through their public index: @/features/<name>.' }] }],
    },
  },
  {
    files: ['src/components/ui/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/features/*', '@/features/*/*'], message: 'The design system must not depend on features.' },
            { group: ['@/lib/api', '@/lib/query-keys', '@tanstack/react-query'], message: 'UI primitives are presentational: pass data in via props.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/features/*/*'], message: 'Routes import features through their public index.' },
            { group: ['@/lib/api', '@tanstack/react-query'], message: 'Routes are thin: data fetching belongs in a feature’s api.ts.' },
          ],
        },
      ],
    },
  },
  { files: ['src/lib/api.ts', 'functions/**', 'scripts/**', 'e2e/**'], rules: { 'no-restricted-globals': 'off', 'no-console': 'off' } },
  { files: ['**/*.test.ts', '**/*.test.tsx'], rules: { 'no-restricted-imports': 'off' } },
];

export default config;
