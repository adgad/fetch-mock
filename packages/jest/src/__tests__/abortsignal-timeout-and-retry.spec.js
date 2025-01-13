import { describe, it, beforeAll, afterEach } from '@jest/globals';

import fetchMockModule from '../index';
const fetchMock = fetchMockModule.default;

const fetchWithAbortSignalTimeout = async (
	url,
	timeout = 1000,
	retryCount = 0,
) => {
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(timeout),
		});
		return await response.json();
	} catch (err) {
		if (retryCount < 3) {
			return fetchWithAbortSignalTimeout(url, timeout, retryCount + 1);
		}
		throw err;
	}
};

describe('do the thing', () => {
	beforeAll(() => {
		fetchMock.mockGlobal();
	});

	afterEach(() => {
		fetchMock.removeRoutes();
	});

	it('handles recursive timeout retries', async () => {
		fetchMock
			.getOnce('http://blah.com', 200, {
				delay: 30,
			})
			.get('http://blah.com', {}, { overwriteRoutes: false });

		const timeout = 20;
		await fetchWithAbortSignalTimeout('http://blah.com', timeout);
	});

	it('then test another thing and get an error', async () => {
		fetchMock.get('http://blah.com', {});
		await fetchWithAbortSignalTimeout('http://blah.com');
	});
});
