import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Rules only (bugs and unsafe patterns). Formatting is left alone: the code uses long single-line JSX on purpose.
export default tseslint.config(
    { ignores: ['build', 'node_modules', 'vite.config.ts'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: { globals: { ...globals.browser } },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'no-console': ['warn', { allow: ['error', 'warn'] }],
            '@typescript-eslint/no-explicit-any': 'off', // narrowed gradually: see lib/api.ts row mapping
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['src/**/__tests__/**', 'src/test/**'],
        rules: { '@typescript-eslint/no-unused-expressions': 'off' },
    },
);
