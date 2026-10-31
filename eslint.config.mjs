import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    // Base JS recommended rules
    eslint.configs.recommended,
    // Base TS recommended rules
    ...tseslint.configs.recommended,
    {ignores: ['web/**','node_modules/', 'dist/', 'build/'],},
    {
        // Ignore build folders or compiled outputs
        rules: {
            // `_foo` means "deliberately unused"; rest-siblings are how we drop fields
            // like passwordHash: `const { passwordHash: _hash, ...safe } = user`
            '@typescript-eslint/no-unused-vars': ['error', {
                args: 'after-used',
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            }],

            // breathing room before control flow and exits
            'padding-line-between-statements': ['error',
                { blankLine: 'always', prev: '*', next: 'return' },
                { blankLine: 'always', prev: '*', next: 'if' },
                { blankLine: 'always', prev: 'if', next: '*' },
            ],
        }
    }
);
