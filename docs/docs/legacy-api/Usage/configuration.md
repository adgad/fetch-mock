---
sidebar_position: 4
---

# Configuration

On any `fetch-mock` instance, set configuration options directly on the `fetchMock.config` object. e.g.

```js
const fetchMock = require('fetch-mock');
fetchMock.config.sendAsJson = false;
```

## Available options

Options marked with a `†` can also be overridden for individual calls to `.mock(matcher, response, options)` by setting as properties on the `options` parameter

### sendAsJson<sup>†</sup>

`{Boolean}` default: `true`

Always convert objects passed to `.mock()` to JSON strings before building reponses. Can be useful to set to `false` globally if e.g. dealing with a lot of `ArrayBuffer`s. When `true` the `Content-Type: application/json` header will also be set on each response.

### includeContentLength<sup>†</sup>

`{Boolean}` default: `true`

Sets a `Content-Length` header on each response.

### fallbackToNetwork

`{Boolean|String}` default: `false`

- `true`: Unhandled calls fall through to the network
- `false`: Unhandled calls throw an error
- `'always'`: All calls fall through to the network, effectively disabling fetch-mock.

### overwriteRoutes<sup>†</sup>

`{Boolean}` default: `undefined`

Configures behaviour when attempting to add a new route with the same name (or inferred name) as an existing one

- `undefined`: An error will be thrown
- `true`: Overwrites the existing route
- `false`: Appends the new route to the list of routes

### matchPartialBody

`{Boolean}` default: `false`

Match calls that only partially match a specified body json.

### warnOnFallback

`{Boolean}` default: `true`

Print a warning if any call is caught by a fallback handler (set using `catch()`, `spy()` or the `fallbackToNetwork` option)

### Custom fetch implementations

`fetch`, `Headers`, `Request`, `Response` can all be set on the configuration object, allowing fetch-mock to mock any implementation if you are not using the default one for the environment.
