//@type-check
import Route, {
	UserRouteConfig,
	RouteResponsePromise,
	RouteConfig,
	RouteResponse,
	RouteResponseData,
	RouteResponseConfig,
} from './Route.js';
import { isUrlMatcher, isFunctionMatcher } from './Matchers.js';
import { RouteMatcher } from './Matchers.js';
import { FetchMockConfig } from './FetchMock.js';
import { hasCredentialsInUrl } from './RequestUtils.js';
import type { CallLog } from './CallHistory.js';

export type ResponseConfigProp =
	| 'body'
	| 'headers'
	| 'throws'
	| 'status'
	| 'redirectUrl';
export type RemoveRouteOptions = {
	includeSticky?: boolean;
	includeFallback?: boolean;
	names?: string[];
};
const responseConfigProps: ResponseConfigProp[] = [
	'body',
	'headers',
	'throws',
	'status',
	'redirectUrl',
];

function nameToOptions(options: RouteConfig | string): RouteConfig {
	return typeof options === 'string' ? { name: options } : options;
}

function isPromise(response: RouteResponse): response is RouteResponsePromise {
	return typeof (response as Promise<unknown>).then === 'function';
}

function normalizeResponseInput(
	responseInput: RouteResponseData,
): RouteResponseConfig {
	// If the response config looks like a status, start to generate a simple response
	if (typeof responseInput === 'number') {
		return {
			status: responseInput,
		};
		// If the response config is not an object, or is an object that doesn't use
		// any reserved properties, assume it is meant to be the body of the response
	} else if (
		typeof responseInput === 'string' ||
		shouldSendAsObject(responseInput)
	) {
		return {
			body: responseInput,
		};
	}
	return responseInput as RouteResponseConfig;
}

function shouldSendAsObject(responseInput: RouteResponseData): boolean {
	// if (Object.keys(responseInput).some(key => responseConfigProps.includes(key)) {
	// 	if (Object.keys(responseInput).some(key => !responseConfigProps.includes(key)) {
	// 		throw new Error(`Ambiguous whether response is a configuration object `)
	// 	} else {return true}
	// }
	// TODO improve this... make it less hacky and magic
	if (
		responseConfigProps.some(
			(prop) => (responseInput as RouteResponseConfig)[prop],
		)
	) {
		if (
			Object.keys(responseInput).every((key) =>
				responseConfigProps.includes(key as ResponseConfigProp),
			)
		) {
			return false;
		}
		return true;
	}
	return true;
}

function throwSpecExceptions({
	url,
	options: { headers, method, body },
}: CallLog) {
	if (headers) {
		Object.entries(headers).forEach(([key]) => {
			if (/\s/.test(key)) {
				throw new TypeError('Invalid name');
			}
		});
	}
	if (hasCredentialsInUrl(url)) {
		throw new TypeError(
			`Request cannot be constructed from a URL that includes credentials: ${url}`,
		);
	}

	if (['get', 'head'].includes(method) && body) {
		throw new TypeError('Request with GET/HEAD method cannot have body.');
	}
}

const resolveUntilResponseConfig = async (callLog: CallLog) => {
	// We want to allow things like
	// - function returning a Promise for a response
	// - delaying (using a timeout Promise) a function's execution to generate
	//   a response
	// Because of this we can't safely check for function before Promisey-ness,
	// or vice versa. So to keep it DRY, and flexible, we keep trying until we
	// have something that looks like neither Promise nor function

	let response = callLog.route.config.response;

	while (true) {
		if (typeof response === 'function') {
			response = response(callLog);
		} else if (isPromise(response)) {
			response = await response;
		} else {
			return response;
		}
	}
};

export default class Router {
	routes: Route[];
	config: FetchMockConfig;
	fallbackRoute: Route;
	constructor(
		fetchMockConfig: FetchMockConfig,
		{ routes, fallbackRoute }: { routes?: Route[]; fallbackRoute?: Route } = {},
	) {
		this.config = fetchMockConfig;
		this.routes = routes || []; // TODO deep clone this??
		this.fallbackRoute = fallbackRoute;
	}

	needsToReadBody(request: Request): boolean {
		return Boolean(
			request && this.routes.some((route) => route.config.usesBody),
		);
	}

	execute(callLog: CallLog): Promise<Response> {
		throwSpecExceptions(callLog);
		// TODO make abort vs reject neater
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async (resolve, reject) => {
			const { url, options, request, pendingPromises } = callLog;
			if (callLog.signal) {
				const abort = () => {
					// TODO may need to bring that flushy thing back.
					// Add a test to combvine flush with abort
					// done();
					const error = new DOMException(
						'The operation was aborted.',
						'AbortError',
					);

					const requestBody = request?.body || options?.body;
					if (requestBody instanceof ReadableStream) {
						if (requestBody.locked) {
							requestBody.getReader().cancel(error);
						} else {
							requestBody.cancel(error);
						}
					}

					if (callLog?.response?.body) {
						if (callLog.response.body.locked) {
							callLog.response.body.getReader().cancel(error);
						} else {
							callLog.response.body.cancel(error);
						}
					}
					reject(error);
				};
				if (callLog.signal.aborted) {
					abort();
				}
				callLog.signal.addEventListener('abort', abort);
			}
			if (this.needsToReadBody(request)) {
				options.body = await options.body;
			}

			const routesToTry = this.fallbackRoute
				? [...this.routes, this.fallbackRoute]
				: this.routes;
			const route = routesToTry.find((route) => route.matcher(callLog));
			if (route) {
				try {
					callLog.route = route;
					const { response, responseOptions, responseInput } =
						await this.generateResponse(callLog);
					const observableResponse = this.createObservableResponse(
						response,
						responseOptions,
						responseInput,
						url,
						pendingPromises,
					);
					callLog.response = response;
					resolve(observableResponse);
				} catch (err) {
					reject(err);
				}
			} else {
				reject(
					new Error(
						`fetch-mock: No response or fallback rule to cover ${
							(options && options.method) || 'GET'
						} to ${url}`,
					),
				);
			}
		});
	}

	async generateResponse(callLog: CallLog): Promise<{
		response: Response;
		responseOptions: ResponseInit;
		responseInput: RouteResponseConfig;
	}> {
		const responseInput = await resolveUntilResponseConfig(callLog);
		// If the response is a pre-made Response, respond with it
		if (responseInput instanceof Response) {
			return {
				response: responseInput,
				responseOptions: {},
				responseInput: {},
			};
		}

		const responseConfig = normalizeResponseInput(responseInput);

		// If the response says to throw an error, throw it
		if (responseConfig.throws) {
			throw responseConfig.throws;
		}

		return callLog.route.constructResponse(responseConfig);
	}
	createObservableResponse(
		response: Response,
		responseConfig: ResponseInit,
		responseInput: RouteResponseConfig,
		responseUrl: string,
		pendingPromises: Promise<unknown>[],
	): Response {
		// Using a proxy means we can set properties that may not be writable on
		// the original Response. It also means we can track the resolution of
		// promises returned by res.json(), res.text() etc
		return new Proxy(response, {
			get: (originalResponse, name) => {
				if (responseInput.redirectUrl) {
					if (name === 'url') {
						return responseInput.redirectUrl;
					}

					if (name === 'redirected') {
						return true;
					}
				} else {
					if (name === 'url') {
						return responseUrl;
					}
					if (name === 'redirected') {
						return false;
					}
				}
				// TODO fix these types properly
				//@ts-expect-error TODO probably make use of generics here
				if (typeof response[name] === 'function') {
					//@ts-expect-error TODO probably make use of generics here
					return new Proxy(response[name], {
						apply: (func, thisArg, args) => {
							const result = func.apply(response, args);
							if (result.then) {
								pendingPromises.push(
									//@ts-expect-error TODO probably make use of generics here
									result.catch(() => undefined),
								);
							}
							return result;
						},
					});
				}
				//@ts-expect-error TODO probably make use of generics here
				return originalResponse[name];
			},
		});
	}

	// addRoute(matcher: UserRouteConfig): void;
	// addRoute(matcher: RouteMatcher, response: RouteResponse, nameOrOptions?: UserRouteConfig | string): void;
	addRoute(
		matcher: RouteMatcher | UserRouteConfig,
		response?: RouteResponse,
		nameOrOptions?: UserRouteConfig | string,
	): void {
		const config: RouteConfig = {};
		if (isUrlMatcher(matcher)) {
			config.url = matcher;
		} else if (isFunctionMatcher(matcher)) {
			config.matcherFunction = matcher;
		} else {
			Object.assign(config, matcher);
		}

		if (typeof response !== 'undefined') {
			config.response = response;
		}

		if (nameOrOptions) {
			Object.assign(
				config,
				typeof nameOrOptions === 'string'
					? nameToOptions(nameOrOptions)
					: nameOrOptions,
			);
		}

		const route = new Route({
			...this.config,
			...config,
		});

		if (
			route.config.name &&
			this.routes.some(
				({ config: { name: existingName } }) =>
					route.config.name === existingName,
			)
		) {
			throw new Error(
				'fetch-mock: Adding route with same name as existing route.',
			);
		}
		this.routes.push(route);
	}
	setFallback(response?: RouteResponse) {
		if (this.fallbackRoute) {
			console.warn(
				'calling fetchMock.catch() twice - are you sure you want to overwrite the previous fallback response',
			);
		}

		this.fallbackRoute = new Route({
			matcherFunction: () => true,
			response: response || 'ok',
			...this.config,
		});
		this.fallbackRoute.config.isFallback = true;
	}
	removeRoutes({
		names,
		includeSticky,
		includeFallback,
	}: RemoveRouteOptions = {}) {
		includeFallback = includeFallback ?? true;
		this.routes = this.routes.filter(({ config: { sticky, name } }) => {
			if (sticky && !includeSticky) {
				return true;
			}
			if (!names) {
				return false;
			}
			return !names.includes(name);
		});
		if (includeFallback) {
			delete this.fallbackRoute;
		}
	}
}
