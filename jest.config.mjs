const config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    collectCoverage: true,
    collectCoverageFrom: [
      './src/**/*.ts',
    ],
    coveragePathIgnorePatterns: [
        '/src/shared',
    ],
    coverageReporters: ['text', 'lcov'],
    coverageDirectory: '<rootDir>/coverage/unit',
    coverageThreshold: {
      global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
      }
    },
    setupFilesAfterEnv: ['<rootDir>/test/setup-jest.ts'],
    resetMocks: true
};

export default config;
