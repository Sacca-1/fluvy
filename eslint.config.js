import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Declared inline rather than pulling in the `globals` package for eleven names. */
const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  requestAnimationFrame: 'readonly',
  getComputedStyle: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'apps/design-lab/out/**',
      'apps/playground/out/**',
      'packages/ui/src/styles/generated/**',
      // the integration: Python, plus the build it ships; and a throwaway instance it was installed into
      'custom_components/**',
      'tools/dev/ha-config/**',
      // temporary probe scripts (judges, debugging): never committed
      'tools/render/.*',
      '.local/**',
      // an agent's worktree under the checkout is its own tree, linted there
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // one import statement per module (a type-only import beside a value import is fine)
    rules: { 'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }] },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
  },
  {
    files: ['apps/design-lab/*.js'],
    languageOptions: { globals: browserGlobals },
  },
  {
    // the loader Home Assistant puts on every page: a browser module
    files: ['packages/bundle/src/*.js'],
    languageOptions: {
      globals: {
        ...browserGlobals,
        setTimeout: 'readonly',
        localStorage: 'readonly',
        Document: 'readonly',
        CSSStyleSheet: 'readonly',
      },
    },
  },
  {
    // the render CLIs carry `page.evaluate` callbacks: Node code and browser code in one module
    files: ['tools/render/*.mjs', 'tools/render/lib/*.mjs'],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        ...browserGlobals,
        localStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        innerHeight: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        PointerEvent: 'readonly',
        MutationObserver: 'readonly',
        NodeFilter: 'readonly',
        PerformanceObserver: 'readonly',
        CSSAnimation: 'readonly',
      },
    },
  },
  {
    files: [
      'tools/release/*.mjs',
      'tools/brand/*.mjs',
      'tools/dev/*.mjs',
      'tools/icons/*.mjs',
      'packages/*/scripts/*.mjs',
    ],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        Buffer: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
);
