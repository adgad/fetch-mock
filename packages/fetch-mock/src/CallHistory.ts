import {
	createCallLogFromUrlAndOptions,
	NormalizedRequestOptions,
} from './RequestUtils.js';
import { isUrlMatcher, RouteMatcher } from './Matchers.js';
import Route, { RouteConfig, RouteName } from './Route.js';
import Router from './Router.js';
import type { FetchMockConfig } from './FetchMock.js';

export type Matched = 'matched';
export type Unmatched = 'unmatched';
export type CallHistoryFilter =
	| RouteName
	| Matched
	| Unmatched
	| boolean
	| RouteMatcher;
export type CallLog = {
	args: unknown[];
	url: string;
	options: NormalizedRequestOptions;
	request?: Request;
	signal?: AbortSignal;
	route?: Route;
	response?: Response;
	expressParams?: {
		[x: string]: string;
	};
	queryParams?: URLSearchParams;
	pendingPromises: Promise<unknown>[];
};

const isName = (filter: CallHistoryFilter): filter is RouteName =>
	typeof filter === 'string' &&
	/^[\da-zA-Z-]+$/.test(filter) &&
	!['matched', 'unmatched'].includes(filter);

const isMatchedOrUnmatched = (
	filter: CallHistoryFilter,
): filter is Matched | Unmatched | boolean =>
	typeof filter === 'boolean' ||
	['matched', 'unmatched'].includes(filter as string);

class CallHistory {
	callLogs: CallLog[];
	config: FetchMockConfig;
	router: Router;
	constructor(config: FetchMockConfig, router: Router) {
		this.callLogs = [];
		this.config = config;
		this.router = router;
	}
	recordCall(callLog: CallLog) {
		this.callLogs.push(callLog);
	}

	clear() {
		this.callLogs.forEach(({ route }) => {
			if (route) {
				route.reset();
			}
		});
		this.callLogs = [];
	}

	async flush(waitForResponseMethods?: boolean): Promise<void> {
		const queuedPromises = this.callLogs.flatMap(
			(call) => call.pendingPromises,
		);
		await Promise.allSettled(queuedPromises);
		if (waitForResponseMethods) {
			// forces an extra tick, which is needed to ensure that flush doesn't resolve
			// before all the complicated promises we set up in the proxy that wraps all
			// the response body methods
			await Promise.resolve();
			await this.flush();
		}
	}
	calls(filter?: CallHistoryFilter, options?: RouteConfig): CallLog[] {
		let calls = [...this.callLogs];
		if (typeof filter === 'undefined' && !options) {
			return calls;
		}

		if (isMatchedOrUnmatched(filter)) {
			if (([true, 'matched'] as CallHistoryFilter[]).includes(filter)) {
				calls = calls.filter((call) => !call.route?.config.isFallback);
			} else if (
				([false, 'unmatched'] as CallHistoryFilter[]).includes(filter)
			) {
				calls = calls.filter((call) => Boolean(call.route?.config.isFallback));
			}

			if (!options) {
				return calls;
			}
		} else if (isName(filter)) {
			calls = calls.filter(
				(call) => call.route?.config.name === filter,
			);
			if (!options) {
				return calls;
			}
		} else {
			if (isUrlMatcher(filter)) {
				options = { url: filter, ...(options || {}) };
			} else {
				options = { ...filter, ...(options || {}) };
			}
		}

		const { matcher } = new Route({
			response: 'ok',
			...options,
		});

		calls = calls.filter(({ url, options }) => {
			return matcher(createCallLogFromUrlAndOptions(url, options));
		});

		return calls;
	}
	called(filter?: CallHistoryFilter, options?: RouteConfig): boolean {
		return Boolean(this.calls(filter, options).length);
	}
	lastCall(filter?: CallHistoryFilter, options?: RouteConfig): CallLog | void {
		return this.calls(filter, options).pop();
	}

	done(routeNames?: RouteName | RouteName[]): boolean {
		let routesToCheck = this.router.routes;
		if (routeNames) {
			routeNames = Array.isArray(routeNames) ? routeNames : [routeNames];
			routesToCheck = this.router.routes.filter(({ config: { name } }) =>
				routeNames.includes(name),
			);
		}
		// TODO what should be the behaviour if no routes defined? Error?
		// Can't use array.every because would exit after first failure, which would
		// break the logging
		return routesToCheck
			.map(
				/** @type {function(Route):boolean}*/ (route) => {
					const calls = this.callLogs.filter(
						({ route: routeApplied }) => routeApplied === route,
					);
					if (!calls.length) {
						console.warn(`Warning: ${route.config.name} not called`);
						return false;
					}

					const expectedTimes = route.config.repeat;

					if (!expectedTimes) {
						return true;
					}
					const actualTimes = calls.length;

					if (expectedTimes > actualTimes) {
						console.warn(
							`Warning: ${route.config.name} only called ${actualTimes} times, but ${expectedTimes} expected`,
						);
						return false;
					}
					return true;
				},
			)
			.every((isDone) => isDone);
	}
}
export default CallHistory;
