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
            // You can add or override specific rules here.
            // For example, if you want to allow 'any' types temporarily:
            // '@typescript-eslint/no-explicit-any': 'warn',
        }
    }
);
