import { RouteConfig } from './Route.js';
import { CallLog } from './CallHistory.js';
import glob from 'glob-to-regexp';
import * as regexparam from 'regexparam';
import { dequal as isEqual } from 'dequal';
import { normalizeHeaders, getPath, normalizeUrl } from './RequestUtils.js';

export type URLMatcherObject = {
	begin?: string;
	end?: string;
	include?: string;
	glob?: string;
	express?: string;
	path?: string;
	regexp?: RegExp;
};
export type RouteMatcherUrl = string | RegExp | URL | URLMatcherObject;
type UrlMatcherGenerator = (targetString: string) => RouteMatcherFunction;
export type RouteMatcherFunction = (callLog: CallLog) => boolean;
type MatcherGenerator = (route: RouteConfig) => RouteMatcherFunction;
export type RouteMatcher = RouteMatcherUrl | RouteMatcherFunction;

export type MatcherDefinition = {
	name: string;
	matcher: MatcherGenerator;
	usesBody?: boolean;
};

export const isUrlMatcher = (
	matcher: RouteMatcher | RouteConfig,
): matcher is RouteMatcherUrl =>
	matcher instanceof RegExp ||
	typeof matcher === 'string' ||
	(typeof matcher === 'object' && 'href' in matcher);

export const isFunctionMatcher = (
	matcher: RouteMatcher | RouteConfig,
): matcher is RouteMatcherFunction => typeof matcher === 'function';

const stringMatchers: { [key: string]: UrlMatcherGenerator } = {
	begin:
		(targetString) =>
		({ url }) =>
			url.startsWith(targetString),
	end:
		(targetString) =>
		({ url }) =>
			url.endsWith(targetString),
	include:
		(targetString) =>
		({ url }) =>
			url.includes(targetString),

	glob: (targetString) => {
		const urlRX = glob(targetString);
		return ({ url }) => urlRX.test(url);
	},
	express: (targetString) => {
		const urlRX = regexparam.parse(targetString);
		return (callLog) => {
			const vals = urlRX.pattern.exec(getPath(callLog.url));
			if (!vals) {
				callLog.expressParams = {};
				return false;
			}
			vals.shift();
			callLog.expressParams = urlRX.keys.reduce(
				(map, paramName, i) =>
					vals[i] ? Object.assign(map, { [paramName]: vals[i] }) : map,
				{},
			);
			return true;
		};
	},
	path: (targetString) => {
		const dotlessTargetString = getPath(targetString);
		return ({ url }) => {
			const path = getPath(url);
			return path === targetString || path === dotlessTargetString;
		};
	},
};
const getHeaderMatcher: MatcherGenerator = ({ headers: expectedHeaders }) => {
	if (!expectedHeaders) {
		return;
	}
	const expectation = normalizeHeaders(expectedHeaders);
	return ({ options: { headers = {} } }) => {
		// TODO do something to handle multi value headers
		const lowerCaseHeaders = normalizeHeaders(headers);
		return Object.keys(expectation).every(
			(headerName) => lowerCaseHeaders[headerName] === expectation[headerName],
		);
	};
};

const getMissingHeaderMatcher: MatcherGenerator = ({
	missingHeaders: expectedMissingHeaders,
}) => {
	if (!expectedMissingHeaders) {
		return;
	}
	const expectation = expectedMissingHeaders.map((header) =>
		header.toLowerCase(),
	);
	return ({ options: { headers = {} } }) => {
		const lowerCaseHeaders = normalizeHeaders(headers);
		return expectation.every((headerName) => !(headerName in lowerCaseHeaders));
	};
};

const getMethodMatcher: MatcherGenerator = ({ method: expectedMethod }) => {
	if (!expectedMethod) {
		return;
	}
	return ({ options: { method } = {} }) => {
		const actualMethod = method ? method.toLowerCase() : 'get';
		return expectedMethod === actualMethod;
	};
};

const getQueryParamsMatcher: MatcherGenerator = ({ query: passedQuery }) => {
	if (!passedQuery) {
		return;
	}
	const expectedQuery = new URLSearchParams();
	for (const [key, value] of Object.entries(passedQuery)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				expectedQuery.append(
					key,
					typeof item === 'object' || typeof item === 'undefined'
						? ''
						: item.toString(),
				);
			}
		} else {
			expectedQuery.append(
				key,
				typeof value === 'object' || typeof value === 'undefined'
					? ''
					: value.toString(),
			);
		}
	}

	const keys = Array.from(expectedQuery.keys());
	return ({ queryParams }) => {
		return keys.every((key) => {
			const expectedValues = expectedQuery.getAll(key).sort();
			const actualValues = queryParams.getAll(key).sort();

			if (expectedValues.length !== actualValues.length) {
				return false;
			}

			if (Array.isArray(passedQuery[key])) {
				return expectedValues.every(
					(expected, index) => expected === actualValues[index],
				);
			}

			return isEqual(actualValues, expectedValues);
		});
	};
};

const getExpressParamsMatcher: MatcherGenerator = ({
	params: expectedParams,
	url,
}) => {
	if (!expectedParams) {
		return;
	}
	if (!(typeof url === 'string' && /express:/.test(url))) {
		throw new Error(
			'fetch-mock: matching on params is only possible when using an express: matcher',
		);
	}
	const expectedKeys = Object.keys(expectedParams);
	return ({ expressParams = {} }) => {
		return expectedKeys.every(
			(key) => expressParams[key] === expectedParams[key],
		);
	};
};

const getBodyMatcher: MatcherGenerator = (route) => {
	const { body: expectedBody } = route;

	if (!expectedBody) {
		return;
	}

	return ({ options: { body, method = 'get' } }) => {
		if (['get', 'head', 'delete'].includes(method.toLowerCase())) {
			// GET requests don’t send a body so even if it exists in the options
			// we treat as no body because it would never actually make it to the server
			// in the application code
			return false;
		}

		let sentBody;

		try {
			if (typeof body === 'string') {
				sentBody = JSON.parse(body);
			}
		} catch {} //eslint-disable-line no-empty

		return (
			sentBody &&
			(route.matchPartialBody
				? isSubsetOf(expectedBody, sentBody)
				: isEqual(expectedBody, sentBody))
		);
	};
};

const isSubsetOf = (
	subset: Record<string, any>,
	superset: Record<string, any>,
): boolean => {
	return Object.entries(subset).every(([key, val]) => {
		if (!(key in superset)) return false;

		if (Array.isArray(val)) {
			return Array.isArray(superset[key]) && 
				val.every(item => superset[key].includes(item));
		}

		if (typeof val === 'object' && val !== null) {
			return isSubsetOf(val, superset[key]);
		}

		return superset[key] === val;
	});
};

const getFunctionMatcher: MatcherGenerator = ({ matcherFunction }) =>
	matcherFunction;

const getRegexpMatcher =
	(regexp: RegExp): RouteMatcherFunction =>
	({ url }) =>
		regexp.test(url);

const getFullUrlMatcher = (
	route: RouteConfig,
	matcherUrl: string,
	query: { [key: string]: string },
): RouteMatcherFunction => {
	// if none of the special syntaxes apply, it's just a simple string match
	// but we have to be careful to normalize the url we check and the name
	// of the route to allow for e.g. http://it.at.there being indistinguishable
	// from http://it.at.there/ once we start generating Request/Url objects
	const expectedUrl = normalizeUrl(matcherUrl, route.allowRelativeUrls);
	if (route.url === matcherUrl) {
		route.url = expectedUrl;
	}

	return ({ url }) => {
		if (query && expectedUrl.indexOf('?')) {
			return getPath(url) === getPath(expectedUrl);
		}
		// set the allowRelatievUrls option to true because, even if the option is not
		// set by the user to true it is nevertheless possible that their application
		// might use relative urls
		return normalizeUrl(url, true) === expectedUrl;
	};
};

const getUrlMatcher: MatcherGenerator = (route) => {
	const { url: matcherUrl, query } = route;

	if (matcherUrl === '*') {
		return () => true;
	}

	if (matcherUrl instanceof RegExp) {
		return getRegexpMatcher(matcherUrl);
	}
	if (matcherUrl instanceof URL) {
		if (matcherUrl.href) {
			return getFullUrlMatcher(route, matcherUrl.href, query);
		}
	}
	if (typeof matcherUrl === 'string') {
		for (const shorthand in stringMatchers) {
			if (matcherUrl.indexOf(`${shorthand}:`) === 0) {
				const urlFragment = matcherUrl.replace(
					new RegExp(`^${shorthand}:`),
					'',
				);
				return stringMatchers[shorthand](urlFragment);
			}
		}
		return getFullUrlMatcher(route, matcherUrl, query);
	}

	if (typeof matcherUrl === 'object') {
		const matchers = Object.entries(matcherUrl).map(([key, pattern]) => {
			if (key === 'regexp') {
				return getRegexpMatcher(pattern);
			} else if (key in stringMatchers) {
				return stringMatchers[key](pattern);
			} else {
				throw new Error(`unrecognised url matching pattern: ${key}`);
			}
		});

		return (route) => matchers.every((matcher) => matcher(route));
	}
};

export const builtInMatchers: MatcherDefinition[] = [
	{ name: 'url', matcher: getUrlMatcher },
	{ name: 'query', matcher: getQueryParamsMatcher },
	{ name: 'method', matcher: getMethodMatcher },
	{ name: 'headers', matcher: getHeaderMatcher },
	{ name: 'missingHeaders', matcher: getMissingHeaderMatcher },
	{ name: 'params', matcher: getExpressParamsMatcher },
	{ name: 'body', matcher: getBodyMatcher, usesBody: true },
	{ name: 'matcherFunction', matcher: getFunctionMatcher },
];
