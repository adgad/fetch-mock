const { debug } = require('../lib/debug');
const glob = require('glob-to-regexp');
const pathToRegexp = require('path-to-regexp');
const querystring = require('querystring');
const isSubset = require('is-subset');
const {
	headers: headerUtils,
	getPath,
	getQuery,
	normalizeUrl,
} = require('../lib/request-utils');
const isEqual = require('lodash.isequal');

const debuggableUrlFunc = (func) => (url) => {
	debug('Actual url:', url);
	return func(url);
};

const stringMatchers = {
	begin: (targetString) =>
		debuggableUrlFunc((url) => url.indexOf(targetString) === 0),
	end: (targetString) =>
		debuggableUrlFunc(
			(url) => url.substr(-targetString.length) === targetString
		),
	glob: (targetString) => {
		const urlRX = glob(targetString);
		return debuggableUrlFunc((url) => urlRX.test(url));
	},
	express: (targetString) => {
		const urlRX = pathToRegexp(targetString);
		return debuggableUrlFunc((url) => urlRX.test(getPath(url)));
	},
	path: (targetString) =>
		debuggableUrlFunc((url) => getPath(url) === targetString),
};

const getHeaderMatcher = ({ headers: expectedHeaders }) => {
	debug('Generating header matcher');
	if (!expectedHeaders) {
		debug('  No header expectations defined - skipping');
		return;
	}
	const expectation = headerUtils.toLowerCase(expectedHeaders);
	debug('  Expected headers:', expectation);
	return (url, { headers = {} }) => {
		debug('Attempting to match headers');
		const lowerCaseHeaders = headerUtils.toLowerCase(
			headerUtils.normalize(headers)
		);
		debug('  Expected headers:', expectation);
		debug('  Actual headers:', lowerCaseHeaders);
		return Object.keys(expectation).every((headerName) =>
			headerUtils.equal(lowerCaseHeaders[headerName], expectation[headerName])
		);
	};
};

const getMethodMatcher = ({ method: expectedMethod }) => {
	debug('Generating method matcher');
	if (!expectedMethod) {
		debug('  No method expectations defined - skipping');
		return;
	}
	debug('  Expected method:', expectedMethod);
	return (url, { method }) => {
		debug('Attempting to match method');
		const actualMethod = method ? method.toLowerCase() : 'get';
		debug('  Expected method:', expectedMethod);
		debug('  Actual method:', actualMethod);
		return expectedMethod === actualMethod;
	};
};

const getQueryStringMatcher = ({ query: passedQuery }) => {
	debug('Generating query parameters matcher');
	if (!passedQuery) {
		debug('  No query parameters expectations defined - skipping');
		return;
	}
	const expectedQuery = querystring.parse(querystring.stringify(passedQuery));
	debug('  Expected query parameters:', passedQuery);
	const keys = Object.keys(expectedQuery);
	return (url) => {
		debug('Attempting to match query parameters');
		const query = querystring.parse(getQuery(url));
		debug('  Expected query parameters:', expectedQuery);
		debug('  Actual query parameters:', query);
		return keys.every((key) => {
			if (Array.isArray(query[key])) {
				if (!Array.isArray(expectedQuery[key])) {
					return false;
				} else {
					return isEqual(query[key].sort(), expectedQuery[key].sort());
				}
			}
			return query[key] === expectedQuery[key];
		});
	};
};

const getParamsMatcher = ({ params: expectedParams, url: matcherUrl }) => {
	debug('Generating path parameters matcher');
	if (!expectedParams) {
		debug('  No path parameters expectations defined - skipping');
		return;
	}
	if (!/express:/.test(matcherUrl)) {
		throw new Error(
			'fetch-mock: matching on params is only possible when using an express: matcher'
		);
	}
	debug('  Expected path parameters:', expectedParams);
	const expectedKeys = Object.keys(expectedParams);
	const keys = [];
	const re = pathToRegexp(matcherUrl.replace(/^express:/, ''), keys);
	return (url) => {
		debug('Attempting to match path parameters');
		const vals = re.exec(getPath(url)) || [];
		vals.shift();
		const params = keys.reduce(
			(map, { name }, i) =>
				vals[i] ? Object.assign(map, { [name]: vals[i] }) : map,
			{}
		);
		debug('  Expected path parameters:', expectedParams);
		debug('  Actual path parameters:', params);
		return expectedKeys.every((key) => params[key] === expectedParams[key]);
	};
};

const getBodyMatcher = (route, fetchMock) => {
	const matchPartialBody = fetchMock.getOption('matchPartialBody', route);
	const { body: expectedBody } = route;

	debug('Generating body matcher');
	return (url, { body, method = 'get' }) => {
		debug('Attempting to match body');
		if (method.toLowerCase() === 'get') {
			debug('  GET request - skip matching body');
			// GET requests don’t send a body so the body matcher should be ignored for them
			return true;
		}

		let sentBody = body;

		try {
			debug('  Parsing request body as JSON');
			sentBody = JSON.parse(body);
		} catch (err) {
			debug('  Failed to parse request body as JSON', err);
		}
		debug('Expected body:', expectedBody);
		debug('Actual body:', sentBody);
		if (matchPartialBody) {
			debug('matchPartialBody is true - checking for partial match only');
		}

		return (
			sentBody &&
			(matchPartialBody
				? isSubset(sentBody, expectedBody)
				: isEqual(sentBody, expectedBody))
		);
	};
};

const getFullUrlMatcher = (route, matcherUrl, query) => {
	// if none of the special syntaxes apply, it's just a simple string match
	// but we have to be careful to normalize the url we check and the name
	// of the route to allow for e.g. http://it.at.there being indistinguishable
	// from http://it.at.there/ once we start generating Request/Url objects
	debug('  Matching using full url', matcherUrl);
	const expectedUrl = normalizeUrl(matcherUrl);
	debug('  Normalised url to:', matcherUrl);
	if (route.identifier === matcherUrl) {
		debug('  Updating route identifier to match normalized url:', matcherUrl);
		route.identifier = expectedUrl;
	}

	return (matcherUrl) => {
		debug('Expected url:', expectedUrl);
		debug('Actual url:', matcherUrl);
		if (query && expectedUrl.indexOf('?')) {
			debug('Ignoring query string when matching url');
			return matcherUrl.indexOf(expectedUrl) === 0;
		}
		return normalizeUrl(matcherUrl) === expectedUrl;
	};
};

const getFunctionMatcher = ({ functionMatcher }) => {
	debug('Detected user defined function matcher', functionMatcher);
	return (...args) => {
		debug('Calling function matcher with arguments', args);
		return functionMatcher(...args);
	};
};

const getUrlMatcher = (route) => {
	debug('Generating url matcher');
	const { url: matcherUrl, query } = route;

	if (matcherUrl === '*') {
		debug('  Using universal * rule to match any url');
		return () => true;
	}

	if (matcherUrl instanceof RegExp) {
		debug('  Using regular expression to match url:', matcherUrl);
		return (url) => matcherUrl.test(url);
	}

	if (matcherUrl.href) {
		debug(`  Using URL object to match url`, matcherUrl);
		return getFullUrlMatcher(route, matcherUrl.href, query);
	}

	for (const shorthand in stringMatchers) {
		if (matcherUrl.indexOf(shorthand + ':') === 0) {
			debug(`  Using ${shorthand}: pattern to match url`, matcherUrl);
			const urlFragment = matcherUrl.replace(new RegExp(`^${shorthand}:`), '');
			return stringMatchers[shorthand](urlFragment);
		}
	}

	return getFullUrlMatcher(route, matcherUrl, query);
};

module.exports = [
	{ name: 'query', matcher: getQueryStringMatcher },
	{ name: 'method', matcher: getMethodMatcher },
	{ name: 'headers', matcher: getHeaderMatcher },
	{ name: 'params', matcher: getParamsMatcher },
	{ name: 'body', matcher: getBodyMatcher, usesBody: true },
	{ name: 'functionMatcher', matcher: getFunctionMatcher },
	{ name: 'url', matcher: getUrlMatcher },
];
