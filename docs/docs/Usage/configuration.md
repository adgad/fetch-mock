---
sidebar_position: 6
---

# Configuration

On any `fetch-mock` instance, set configuration options directly on the `fetchMock.config` object. e.g.

```js
const fetchMock = require('fetch-mock');
fetchMock.config.matchPartialBody = false;
```

## Available options

Options marked with a `†` can also be overridden for individual calls to `.route(matcher, response, options)` by setting as properties on the `options` parameter

### includeContentLength<sup>†</sup>

`{Boolean}` default: `true`

Sets a `Content-Length` header on each response, with the exception of responses whose body is a `FormData` or `ReadableStream` instance as these are hard/impossible to calculate up front.

### matchPartialBody<sup>†</sup>

`{Boolean}` default: `false`

Match calls that only partially match a specified body json. 

### allowRelativeUrls<sup>†</sup>

`{Boolean}` default: `false`

`fetch` in node.js does not support relative urls. For the purposes of testing browser modules in node.js it is possible to use this flag to avoid errors. However, you may prefer to use [jsdom](https://www.npmjs.com/package/jsdom) or similar to set `globalThis.location` to an instance of the DOM class `Location`.

### Custom fetch implementations

`fetch`, `Headers`, `Request`, `Response` can all be set on the configuration object, allowing fetch-mock to mock any implementation of `fetch`, e.g. `node-fetch`. e.g.

```js
import { default as fetch, Headers, Request, Response } from 'node-fetch';

import fetchMock from 'fetch-mock';

fetchMock.config = Object.assign(fetchMock.config, {
	Request,
	Response,
	Headers,
	fetch,
});
```
