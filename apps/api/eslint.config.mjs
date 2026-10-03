import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.sandbox/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  { files: ['test/**/*.ts', 'prisma/**/*.ts'], rules: { 'no-console': 'off' } },
  { files: ['**/*.js'], languageOptions: { globals: { require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly' }, sourceType: 'commonjs' }, rules: { '@typescript-eslint/no-require-imports': 'off' } },
);
