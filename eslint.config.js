const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
    {
        ignores: ['cdk.out/**', 'local/**', 'eslint.config.js'],
    },
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            globals: {
                Atomics: 'readonly',
                SharedArrayBuffer: 'readonly',
            },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            '@typescript-eslint/indent': 'off',
            'linebreak-style': 'off',
            'no-console': 'off',
            'max-len': 'off',
            'no-restricted-syntax': 'warn',
            indent: ['error', 4],
            'no-new': 'off',
        },
    },
);
