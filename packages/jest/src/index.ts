import {
	FetchMock,
	defaultFetchMockConfig,
	RemoveRouteOptions,
} from '@fetch-mock/core';
import './jest-extensions';
import type { Jest } from '@jest/environment';

type MockResetOptions = {
	includeSticky: boolean;
};

class FetchMockJest extends FetchMock {
	mockClear() {
		this.clearHistory();
		return this;
	}
	mockReset(options: MockResetOptions = { includeSticky: false }) {
		this.removeRoutes({
			...options,
			includeFallback: true,
		} as RemoveRouteOptions);
		return this.mockClear();
	}
	mockRestore(options?: MockResetOptions) {
		this.unmockGlobal();
		return this.mockReset(options);
	}
}

export function manageFetchMockGlobally(jest: Jest) {
	const { clearAllMocks, resetAllMocks, restoreAllMocks } = jest;

	jest.clearAllMocks = () => {
		clearAllMocks.apply(jest);
		fetchMockJest.mockClear();
		return jest;
	};

	jest.resetAllMocks = () => {
		resetAllMocks.apply(jest);
		fetchMockJest.mockReset();
		return jest;
	};

	jest.restoreAllMocks = () => {
		restoreAllMocks.apply(jest);
		fetchMockJest.mockRestore();
		return jest;
	};
}

const fetchMockJest = new FetchMockJest({
	...defaultFetchMockConfig,
});

export default fetchMockJest;
