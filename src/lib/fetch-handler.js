const ResponseBuilder = require('./response-builder');
const requestUtils = require('./request-utils');
const FetchMock = {};

const normalizeRequest = (url, options, Request) => {
	if (Request.prototype.isPrototypeOf(url)) {
		const obj = {
			url: requestUtils.normalizeURL(url.url),
			opts: {
				method: url.method
			},
			request: url
		};

		const headers = requestUtils.headers.toArray(url.headers);

		if (headers.length) {
			obj.opts.headers = requestUtils.headers.zip(headers);
		}
		return obj;
	} else if (
		typeof url === 'string' ||
		// horrible URL object duck-typing
		(typeof url === 'object' && 'href' in url)
	) {
		return {
			url: requestUtils.normalizeURL(url),
			opts: options
		};
	} else if (typeof url === 'object') {
		throw new TypeError(
			'fetch-mock: Unrecognised Request object. Read the Config and Installation sections of the docs'
		);
	} else {
		throw new TypeError('fetch-mock: Invalid arguments passed to fetch');
	}
};

FetchMock.fetchHandler = function(url, opts, request) {
	({ url, opts, request } = normalizeRequest(url, opts, this.config.Request));

	const response = this.executeRouter(url, opts, request);

	// this is used to power the .flush() method
	let done;
	this._holdingPromises.push(new this.config.Promise(res => (done = res)));

	// wrapped in this promise to make sure we respect custom Promise
	// constructors defined by the user
	return new this.config.Promise((res, rej) => {
		this.generateResponse(response, url, opts)
			.then(res, rej)
			.then(done, done);
	});
};

FetchMock.fetchHandler.isMock = true;

FetchMock.executeRouter = function(url, opts, request) {
	if (this.config.fallbackToNetwork === 'always') {
		return this.getNativeFetch();
	}

	const response = this.router(url, opts, request);

	if (response) {
		return response;
	}

	if (this.config.warnOnFallback) {
		console.warn(`Unmatched ${opts && opts.method || 'GET'} to ${url}`); // eslint-disable-line
	}

	this.push(null, request ? [url, opts, request] : [url, opts]);

	if (this.fallbackResponse) {
		return this.fallbackResponse;
	}

	if (!this.config.fallbackToNetwork) {
		throw new Error(
			`fetch-mock: No fallback response defined for ${(opts && opts.method) ||
				'GET'} to ${url}`
		);
	}

	return this.getNativeFetch();
};

FetchMock.generateResponse = async function(response, url, opts) {
	// We want to allow things like
	// - function returning a Promise for a response
	// - delaying (using a timeout Promise) a function's execution to generate
	//   a response
	// Because of this we can't safely check for function before Promisey-ness,
	// or vice versa. So to keep it DRY, and flexible, we keep trying until we
	// have something that looks like neither Promise nor function
	while (
		typeof response === 'function' ||
		typeof response.then === 'function'
	) {
		if (typeof response === 'function') {
			response = response(url, opts);
		} else {
			// Strange .then is to cope with non ES Promises... god knows why it works
			response = await response.then(it => it);
		}
	}

	// If the response says to throw an error, throw it
	// Type checking is to deal with sinon spies having a throws property :-0
	if (response.throws && typeof response !== 'function') {
		throw response.throws;
	}

	// If the response is a pre-made Response, respond with it
	if (this.config.Response.prototype.isPrototypeOf(response)) {
		return response;
	}

	// finally, if we need to convert config into a response, we do it
	return new ResponseBuilder(url, response, this).exec();
};

FetchMock.router = function(url, opts, request) {
	const route = this.routes.find(route => route.matcher(url, opts));

	if (route) {
		this.push(route.name, request ? [url, opts, request] : [url, opts]);
		return route.response;
	}
};

FetchMock.getNativeFetch = function() {
	const func = this.realFetch || (this.isSandbox && this.config.fetch);
	if (!func) {
		throw new Error(
			'fetch-mock: Falling back to network only available on gloabl fetch-mock, or by setting config.fetch on sandboxed fetch-mock'
		);
	}
	return func;
};

FetchMock.push = function(name, args) {
	if (name) {
		this._calls[name] = this._calls[name] || [];
		this._calls[name].push(args);
		this._allCalls.push(args);
	} else {
		args.unmatched = true;
		this._allCalls.push(args);
	}
};

module.exports = FetchMock;
