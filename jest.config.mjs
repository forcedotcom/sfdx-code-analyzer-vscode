const config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src/test/unit'],
    testMatch: ['**/*.test.ts'],
    collectCoverage: true,
    collectCoverageFrom: [
      './src/**/*.ts',
    ],
    coveragePathIgnorePatterns: [
        '/src/test/',
    ],
    coverageReporters: ['text', 'lcov'],
    coverageDirectory: '<rootDir>/coverage/unit',
    setupFilesAfterEnv: ['./scripts/setup-jest.ts'],
    resetMocks: true
};

export default config;
