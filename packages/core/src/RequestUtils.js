// @type-check
// https://stackoverflow.com/a/19709846/308237 plus data: scheme
// split into 2 code paths as URL constructor does not support protocol-relative urls
const absoluteUrlRX = new RegExp('^[a-z]+://|^data:', 'i');
const protocolRelativeUrlRX = new RegExp('^//', 'i');

/**
 * @typedef DerivedRequestOptions
 * @property  {string} method
 * @property  {string} [body]
 * @property  {{ [key: string]: string }} [headers]
 */

/** @typedef {RequestInit | (RequestInit & DerivedRequestOptions) } NormalizedRequestOptions */
/** @typedef {import('./CallHistory.js').CallLog} CallLog */

/**
 * @param {string | string | URL} url
 * @returns {string}
 */
export function normalizeUrl(url) {
	if (url instanceof URL) {
		return url.href;
	}
	if (absoluteUrlRX.test(url)) {
		return new URL(url).href;
	}
	if (protocolRelativeUrlRX.test(url)) {
		return new URL(url, 'http://dummy').href;
	}
	const u = new URL(url, 'http://dummy');
	return u.pathname + u.search;
}

/**
 *
 * @param {string | object} url
 * @param {RequestInit} options
 * @returns {CallLog}
 */
export function createCallLogFromUrlAndOptions(url, options) {
	/** @type {Promise<any>[]} */
	const pendingPromises = [];
	if (typeof url === 'string' || url instanceof String || url instanceof URL) {
		// @ts-ignore - jsdoc doesn't distinguish between string and String, but typechecker complains
		url = normalizeUrl(url);
		const derivedOptions = options ? { ...options } : {};
		if (derivedOptions.headers) {
			derivedOptions.headers = normalizeHeaders(derivedOptions.headers);
		}
		derivedOptions.method = derivedOptions.method
			? derivedOptions.method.toLowerCase()
			: 'get';
		return {
			args: [url, options],
			url,
			queryParams: new URLSearchParams(getQuery(url)),
			options: derivedOptions,
			signal: derivedOptions.signal,
			pendingPromises,
		};
	}
	if (typeof url === 'object') {
		throw new TypeError(
			'fetch-mock: Unrecognised Request object. Read the Config and Installation sections of the docs',
		);
	} else {
		throw new TypeError('fetch-mock: Invalid arguments passed to fetch');
	}
}

/**
 *
 * @param {Request} request
 * @returns {Promise<CallLog>}
 */
export async function createCallLogFromRequest(request) {
	/** @type {Promise<any>[]} */
	const pendingPromises = [];
	/** @type {NormalizedRequestOptions} */
	const derivedOptions = {
		method: request.method,
	};

	try {
		derivedOptions.body = await request.clone().text();
	} catch (err) {}

	if (request.headers) {
		derivedOptions.headers = normalizeHeaders(request.headers);
	}
	const url = normalizeUrl(request.url);
	const callLog = {
		args: [request],
		url,
		queryParams: new URLSearchParams(getQuery(url)),
		options: derivedOptions,
		request: request,
		signal: request.signal,
		pendingPromises,
	};
	return callLog;
}

/**
 * @param {string} url
 * @returns {string}
 */
export function getPath(url) {
	const u = absoluteUrlRX.test(url)
		? new URL(url)
		: new URL(url, 'http://dummy');
	return u.pathname;
}

/**
 * @param {string} url
 * @returns {string}
 */
export function getQuery(url) {
	const u = absoluteUrlRX.test(url)
		? new URL(url)
		: new URL(url, 'http://dummy');
	return u.search ? u.search.substr(1) : '';
}

/**
 *
 * @param {HeadersInit | Object.<string, string |number>} headers
 * @returns {Object.<string, string>}
 */
export const normalizeHeaders = (headers) => {
	let entries;
	if (headers instanceof Headers) {
		entries = [...headers.entries()];
	} else if (Array.isArray(headers)) {
		entries = headers;
	} else {
		entries = Object.entries(headers);
	}
	return Object.fromEntries(
		entries.map(([key, val]) => [key.toLowerCase(), String(val).valueOf()]),
	);
};
