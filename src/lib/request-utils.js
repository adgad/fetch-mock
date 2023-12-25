// https://stackoverflow.com/a/19709846/308237
// split, URL constructor does not support protocol-relative urls
const absoluteUrlRX = new RegExp('^[a-z]+://', 'i');
const protocolRelativeUrlRX = new RegExp('^//', 'i');

const headersToArray = (headers) => {
	// node-fetch 1 Headers
	if (typeof headers.raw === 'function') {
		return Object.entries(headers.raw());
	} if (headers[Symbol.iterator]) {
		return [...headers];
	}
	return Object.entries(headers);
};

const zipObject = (entries) => entries.reduce((obj, [key, val]) => Object.assign(obj, { [key]: val }), {});

export function normalizeUrl(url) {
	if (
		typeof url === 'function'
		|| url instanceof RegExp
		|| /^(begin|end|glob|express|path)\:/.test(url)
	) {
		return url;
	}
	if (absoluteUrlRX.test(url)) {
		const u = new URL(url);
		return u.href;
	} if (protocolRelativeUrlRX.test(url)) {
		const u = new URL(url, 'http://dummy');
		return u.href;
	}
	const u = new URL(url, 'http://dummy');
	return u.pathname + u.search;
}

// Because node-fetch's request.body.toString() is synchronous but
// native fetch's request.clone().text() is async we wrap in an async
// function to guarantee a promise is always returned
const extractBody = async (request) => { //eslint-disable-line require-await
	try {
		// fetch and node-fetch@3
		return request.clone().text();

		// node-fetch@2
		if ('body' in request) {
			return request.body.toString();
		}

	} catch (err) {}
};

export function normalizeRequest(url, options, Request) {
	if (Request.prototype.isPrototypeOf(url)) {
		const derivedOptions = {
			method: url.method,
		};

		const body = extractBody(url);

		if (typeof body !== 'undefined') {
			derivedOptions.body = body;
		}

		const normalizedRequestObject = {
			url: normalizeUrl(url.url),
			options: Object.assign(derivedOptions, options),
			request: url,
			signal: options && options.signal || url.signal,
		};

		const headers = headersToArray(url.headers);

		if (headers.length) {
			normalizedRequestObject.options.headers = zipObject(headers);
		}
		return normalizedRequestObject;
	} if (
		typeof url === 'string'
		// horrible URL object duck-typing
		|| typeof url === 'object' && 'href' in url
	) {
		return {
			url: normalizeUrl(url),
			options,
			signal: options && options.signal,
		};
	} if (typeof url === 'object') {
		throw new TypeError(
			'fetch-mock: Unrecognised Request object. Read the Config and Installation sections of the docs',
		);
	} else {
		throw new TypeError('fetch-mock: Invalid arguments passed to fetch');
	}
}

export function getPath(url) {
	const u = absoluteUrlRX.test(url)
		? new URL(url)
		: new URL(url, 'http://dummy');
	return u.pathname;
}

export function getQuery(url) {
	const u = absoluteUrlRX.test(url)
		? new URL(url)
		: new URL(url, 'http://dummy');
	return u.search ? u.search.substr(1) : '';
}

export const headers = {
	normalize: (headers) => zipObject(headersToArray(headers)),
	toLowerCase: (headers) => Object.keys(headers).reduce((obj, k) => {
		obj[k.toLowerCase()] = headers[k];
		return obj;
	}, {}),
	equal: (actualHeader, expectedHeader) => {
		actualHeader = Array.isArray(actualHeader) ? actualHeader : [actualHeader];
		expectedHeader = Array.isArray(expectedHeader)
			? expectedHeader
			: [expectedHeader];

		if (actualHeader.length !== expectedHeader.length) {
			return false;
		}

		return actualHeader.every((val, i) => val === expectedHeader[i]);
	},
};
