const config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src/test/unit'],
    testMatch: ['**/*.test.ts'],
    collectCoverage: true,
    collectCoverageFrom: [
      'src/**/*.ts',
    ],
    coverageReporters: ['text', 'lcov'],
    coverageDirectory: '<rootDir>/coverage/unit'
};

export default config;