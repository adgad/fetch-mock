/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
	testEnvironment: 'node',
	transform: {
		'^.+.tsx?$': ['ts-jest', {}],
	},
	moduleNameMapper: {
		'@fetch-mock/core': '<rootDir>/packages/core/dist/cjs/index.js',
		'(.+)\\.js': '$1',
	},
};
