import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.ts', 'src/**/*.tsx'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parser: tsParser,
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        plugins: {
            '@typescript-eslint': ts,
            prettier: prettier,
        },
        rules: {
            ...ts.configs.recommended.rules,
            'prettier/prettier': 'error',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-undef': 'off', // TypeScript already handles this and sometimes it conflicts with globals in v9
        },
    },
    prettierConfig,
];
