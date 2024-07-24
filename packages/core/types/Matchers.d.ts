export function isUrlMatcher(matcher: RouteMatcher | RouteConfig): matcher is RouteMatcherUrl;
export function isFunctionMatcher(matcher: RouteMatcher | RouteConfig): matcher is RouteMatcherFunction;
export const builtInMatchers: MatcherDefinition[];
export type RouteConfig = import("./Route.js").RouteConfig;
export type CallLog = import("./CallHistory.js").CallLog;
export type RouteMatcherUrl = string | RegExp | URL;
export type UrlMatcherGenerator = (arg0: string) => RouteMatcherFunction;
export type RouteMatcherFunction = (arg0: CallLog) => boolean;
export type MatcherGenerator = (arg0: RouteConfig) => RouteMatcherFunction;
export type RouteMatcher = RouteMatcherUrl | RouteMatcherFunction;
export type MatcherDefinition = {
    name: string;
    matcher: MatcherGenerator;
    usesBody?: boolean;
};
