import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    testTimeout: 10000,
    coverage: {
      include: ['src/**/*.ts']
    }
  }
})
