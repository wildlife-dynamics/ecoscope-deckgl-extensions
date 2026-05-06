import { defineConfig } from 'eslint/config';

export default tseslint.defineConfig(
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  }
);
