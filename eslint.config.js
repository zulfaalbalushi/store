export default [
  {
    ignores: ['node_modules/**', 'data/**', 'storage/uploads/**'],
  },
  {
    files: ['server/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      eqeqeq: 'error',
      'no-constant-condition': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
    },
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        document: 'readonly',
        fetch: 'readonly',
        location: 'readonly',
        sessionStorage: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      eqeqeq: 'error',
      'no-constant-condition': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
    },
  },
  {
    files: ['js/dishCard.js', 'js/sampleDishes.js'],
    rules: {
      // These legacy scripts intentionally expose globals to later script tags.
      'no-unused-vars': 'off',
    },
  },
];
