import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The dependency-cruiser config is CommonJS, as that tool requires.
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable', require: 'readonly' } },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['react', 'react-dom', 'react/*', '**/sims/**', '**/ui/**', '**/app/**'], message: 'The numerical core is framework-independent.' }],
      }],
    },
  },
  {
    // PHYSICS_SPEC §1: constants exist in exactly one file. A literal in physics code is either a
    // constant that belongs in units.ts or an undocumented approximation — both are bugs.
    // Small algebraic integers (a factor of 2, a cube root argument, a vector component index)
    // are method arithmetic, not measured quantities, so they stay allowed.
    // Scope is the physics layers. app/ and ui/ are presentation: a layout number there is not a
    // physical constant, and forcing names onto them would only dilute the rule.
    files: ['src/core/**/*.ts', 'src/sims/**/*.{ts,tsx}'],
    ignores: ['src/core/units.ts', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-magic-numbers': ['error', {
        ignore: [-2, -1, 0, 0.5, 1, 2, 3, 4, 6],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        enforceConst: true,
        detectObjects: true,
      }],
    },
  },
);
