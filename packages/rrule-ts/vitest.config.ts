import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup-temporal.ts'],
    coverage: {
      provider: 'v8',
      // Coverage is scoped to the implemented files only. Stubs in text/ and
      // locales/ are excluded until the expansion phase wires real behaviour.
      include: [
        'src/temporal.ts',
        'src/result.ts',
        'src/types.ts',
        'src/parse.ts',
        'src/stringify.ts',
        'src/validate.ts',
        'src/index.ts',
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
