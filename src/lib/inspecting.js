const { setDebugPhase, setDebugNamespace, debug } = require('./debug');
const { normalizeUrl } = require('./request-utils');
const FetchMock = {};
const { sanitizeRoute } = require('./compile-route');
const generateMatcher = require('./generate-matcher');
const isName = nameOrMatcher =>
	typeof nameOrMatcher === 'string' && /^[\da-zA-Z\-]+$/.test(nameOrMatcher);

const filterCallsWithMatcher = (matcher, options = {}, calls, fetchMockInstance) => {
	matcher = generateMatcher(sanitizeRoute(Object.assign({ matcher }, options)), fetchMockInstance);
	return calls.filter(([url, options]) => matcher(normalizeUrl(url), options));
};

const formatDebug = func => {
	return function(...args) {
		setDebugPhase('inspect');
		const result = func.call(this, ...args);
		setDebugPhase();
		return result;
	};
};

FetchMock.filterCalls = function(nameOrMatcher, options) {
	debug('Filtering fetch calls');
	let calls = this._calls;
	let matcher = '*';

	if ([true, 'matched'].includes(nameOrMatcher)) {
		debug(`Filter provided is ${nameOrMatcher}. Returning matched calls only`);
		calls = calls.filter(({ isUnmatched }) => !isUnmatched);
	} else if ([false, 'unmatched'].includes(nameOrMatcher)) {
		debug(
			`Filter provided is ${nameOrMatcher}. Returning unmatched calls only`
		);
		calls = calls.filter(({ isUnmatched }) => isUnmatched);
	} else if (typeof nameOrMatcher === 'undefined') {
		debug(`Filter provided is undefined. Returning all calls`);
		calls = calls;
	} else if (isName(nameOrMatcher)) {
		debug(
			`Filter provided, looks like the name of a named route. Returning only calls handled by that route`
		);
		calls = calls.filter(({ identifier }) => identifier === nameOrMatcher);
	} else {
		matcher = normalizeUrl(nameOrMatcher);
		if (this.routes.some(({ identifier }) => identifier === matcher)) {
			debug(
				`Filter provided, ${nameOrMatcher}, identifies a route. Returning only calls handled by that route`
			);
			calls = calls.filter(call => call.identifier === matcher);
		}
	}

	if ((options || matcher !== '*') && calls.length) {
		if (typeof options === 'string') {
			options = { method: options };
		}
		debug(
			'Compiling filter and options to route in order to filter all calls',
			nameOrMatcher
		);
		calls = filterCallsWithMatcher(matcher, options, calls, this);
	}
	debug(`Retrieved ${calls.length} calls`);
	return calls;
};

FetchMock.calls = formatDebug(function(nameOrMatcher, options) {
	debug('retrieving matching calls');
	return this.filterCalls(nameOrMatcher, options);
});

FetchMock.lastCall = formatDebug(function(nameOrMatcher, options) {
	debug('retrieving last matching call');
	return [...this.filterCalls(nameOrMatcher, options)].pop();
});

FetchMock.lastUrl = formatDebug(function(nameOrMatcher, options) {
	debug('retrieving url of last matching call');
	return (this.lastCall(nameOrMatcher, options) || [])[0];
});

FetchMock.lastOptions = formatDebug(function(nameOrMatcher, options) {
	debug('retrieving options of last matching call');
	return (this.lastCall(nameOrMatcher, options) || [])[1];
});

FetchMock.called = formatDebug(function(nameOrMatcher, options) {
	debug('checking if matching call was made');
	return !!this.filterCalls(nameOrMatcher, options).length;
});

FetchMock.flush = formatDebug(async function(waitForResponseMethods) {
	setDebugNamespace('flush');
	debug(
		`flushing all fetch calls. ${
			waitForResponseMethods ? '' : 'Not '
		}waiting for response bodies to complete download`
	);

	const queuedPromises = this._holdingPromises;
	this._holdingPromises = [];
	debug(`${queuedPromises.length} fetch calls to be awaited`);

	await Promise.all(queuedPromises);
	debug(`All fetch calls have completed`);
	if (waitForResponseMethods && this._holdingPromises.length) {
		debug(`Awaiting all fetch bodies to download`);
		await this.flush(waitForResponseMethods);
		debug(`All fetch bodies have completed downloading`);
	}
	setDebugNamespace();
});

FetchMock.done = formatDebug(function(nameOrMatcher) {
	setDebugPhase('inspect');
	setDebugNamespace('done');
	debug('Checking to see if expected calls have been made');
	let routesToCheck;

	if (nameOrMatcher && typeof nameOrMatcher !== 'boolean') {
		debug(
			'Checking to see if expected calls have been made for single route:',
			nameOrMatcher
		);
		routesToCheck = [{ identifier: nameOrMatcher }];
	} else {
		debug('Checking to see if expected calls have been made for all routes');
		routesToCheck = this.routes;
	}

	// Can't use array.every because would exit after first failure, which would
	// break the logging
	const result = routesToCheck
		.map(({ identifier }) => {
			if (!this.called(identifier)) {
				debug('No calls made for route:', identifier);
				console.warn(`Warning: ${identifier} not called`); // eslint-disable-line
				return false;
			}

			const expectedTimes = (
				this.routes.find(r => r.identifier === identifier) || {}
			).repeat;

			if (!expectedTimes) {
				debug(
					'Route has been called at least once, and no expectation of more set:',
					identifier
				);
				return true;
			}
			const actualTimes = this.filterCalls(identifier).length;

			debug(`Route called ${actualTimes} times:`, identifier);
			if (expectedTimes > actualTimes) {
				debug(
					`Route called ${actualTimes} times, but expected ${expectedTimes}:`,
					identifier
				);
				console.warn(
					`Warning: ${identifier} only called ${actualTimes} times, but ${expectedTimes} expected`
				); // eslint-disable-line
				return false;
			} else {
				return true;
			}
		})
		.every(isDone => isDone);

	setDebugNamespace();
	setDebugPhase();
	return result;
});

module.exports = FetchMock;
