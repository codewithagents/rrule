import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup-temporal.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/temporal.ts',
        'src/result.ts',
        'src/parse.ts',
        'src/stringify.ts',
        'src/validate.ts',
        'src/index.ts',
        'src/expand.ts',
        'src/rruleset.ts',
        // Text rendering and locale packs (Phase 1: EN toText/i18n, Phase 2: DE).
        'src/text/index.ts',
        'src/text/toText.ts',
        'src/locales/types.ts',
        'src/locales/en.ts',
        'src/locales/de.ts',
      ],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
      reporter: ['text', ['lcov', { projectRoot: '../../' }]],
    },
  },
})
