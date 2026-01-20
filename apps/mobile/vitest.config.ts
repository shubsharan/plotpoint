import { defineProject } from 'vitest/config';
import path from 'path';

export default defineProject({
  test: {
    name: 'mobile',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        'src/__tests__/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@plotpoint/schemas': path.resolve(__dirname, '../../packages/schemas/src/index.ts'),
    },
  },
});
