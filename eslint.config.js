// ESLint flat config.
//
// `npm run lint` has been in package.json for a long time and has never once
// been able to run: ESLint 9 requires this file, and the repo had no ESLint
// config of any kind, so the script exited with a config error every time. A
// check that cannot run is worse than no check, because the script's presence
// implies it passes.
//
// Deliberately narrow. This is a lint gate for real defects — hook misuse,
// unreachable code, accidental globals — not a style enforcer. Formatting is
// not linted; nobody needs a robot with an opinion about quote marks.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    // The server has its own TypeScript toolchain and is covered by `tsc
    // --noEmit`; linting it here would need a second parser for no gain.
    ignores: ['dist/**', 'node_modules/**', 'server/**', 'base44/**', 'public/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // __DEV_AREA_VISIBLE__ is substituted by Vite's `define` at build time
      // (vite.config.js). It is genuinely undeclared in source, which is the
      // point — declaring it would defeat the constant folding that removes the
      // Development area from the bundle — so it is named here instead.
      globals: { ...globals.browser, ...globals.es2021, __DEV_AREA_VISIBLE__: 'readonly' },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      // Without this, every imported component reads as unused: core ESLint
      // does not know that <Button /> is a reference to `Button`.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',

      // The two that catch real bugs rather than preferences. A conditional
      // hook and a stale closure in a dependency array are both defects that
      // typecheck and tests routinely miss.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // `catch {}` with no binding is used throughout for storage access that
      // is allowed to fail, so an unused error binding is not a finding.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],

      // Same pattern, other half: `try { localStorage.setItem(...) } catch {}`
      // and `try { document.execCommand('copy') } catch {}` are deliberate
      // throughout — private mode and clipboard permissions are allowed to
      // fail, and there is genuinely nothing to do about it. Empty blocks
      // anywhere ELSE are still errors.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // console.warn/error are legitimate for surfacing real failures; a bare
      // console.log left in a component is debug residue.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Node scripts: different globals, and console IS the output device.
    files: ['scripts/**/*.{js,mjs}', 'eslint.config.js', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['test/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
];
