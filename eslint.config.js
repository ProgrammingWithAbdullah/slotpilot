// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'planning/**',
      '**/*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': 'warn',
    },
  },
  // ---- API (Node) ----
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Architecture boundary: the web app and the API only share code through @slotpilot/shared.
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['**/apps/web/**', '@slotpilot/web'], message: 'The API must not import the web app.' }],
        },
      ],
    },
  },
  {
    // The AI module is a pure "extract" layer: it may log its own calls but must not reach into
    // other modules' repositories. Booking rules live in the chat/appointments modules.
    files: ['apps/api/src/modules/ai/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../appointments/*', '../chat/*', '../auth/*'],
              message: 'The AI module must stay independent of other modules.',
            },
            {
              group: ['**/*.repository', '!./ai-log.repository'],
              message: 'The AI module must not use other repositories.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/db/**/*.ts', 'apps/api/scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  // ---- Web (browser) ----
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/apps/api/**', '@slotpilot/api'], message: 'The web app talks to the API over HTTP only.' },
          ],
        },
      ],
    },
  },
  // ---- Tests and tooling ----
  {
    files: ['**/test/**', '**/*.test.{ts,tsx}', 'e2e/**', '**/*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-non-null-assertion': 'off', 'no-console': 'off' },
  },
);
