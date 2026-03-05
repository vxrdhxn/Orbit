module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node', // Use node for extension tests, jsdom for UI tests if we add them later
    roots: ['<rootDir>/src', '<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    moduleNameMapper: {
        '^vscode$': '<rootDir>/test/vscodeMock.ts',
    },
};
