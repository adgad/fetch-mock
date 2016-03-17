'use strict';
const fetch = require('node-fetch');
const Request = fetch.Request;
const Response = fetch.Response;
const Headers = fetch.Headers;
const stream = require('stream');
const FetchMock = require('./fetch-mock');
const http = require('http');

module.exports = new FetchMock({
	theGlobal: GLOBAL,
	Request: Request,
	Response: Response,
	Headers: Headers,
	stream: stream,
	STATUS_TEXT: http.STATUS_CODES,
	debug: function () {
		if (process.env.DEBUG && process.env.DEBUG.indexOf('fetch-mock') > -1) {
			console.log.apply(console, [].slice.call(arguments)); //eslint-disable-line
		}
	}
});
