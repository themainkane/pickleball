import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    // Base JS recommended rules
    eslint.configs.recommended,
    // Base TS recommended rules
    ...tseslint.configs.recommended,
    {
        // Ignore build folders or compiled outputs
        ignores: ['node_modules/', 'dist/', 'build/'],
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
