import { beforeEach, describe, expect, it } from 'vitest';
import fetchMock from '../../FetchMock';

describe('response construction', () => {
	let fm;
	beforeEach(() => {
		fm = fetchMock.createInstance();
		fm.config.warnOnUnmatched = false;
	});

	describe('status', () => {
		it('respond with a status', async () => {
			fm.route('*', 300);
			const res = await fm.fetchHandler('http://a.com/');
			expect(res.status).toEqual(300);
			expect(res.statusText).toEqual('Multiple Choices');
		});

		it('should error on invalid statuses', async () => {
			fm.route('*', { status: 'not number' });
			try {
				await fm.fetchHandler('http://a.com');
				expect.unreachable('Line above should throw');
			} catch (err) {
				expect(err.message).toMatch(
					/Invalid status not number passed on response object/,
				);
			}
		});

		it('should be able to send status 0', async () => {
			fm.route('*', { status: 0 });
			const res = await fm.fetchHandler('http://a.com/');
			expect(res.status).toEqual(0);
			expect(res.statusText).toEqual('');
		});
	});

	describe('string', () => {
		it('respond with a string', async () => {
			fm.route('*', 'a string');
			const res = await fm.fetchHandler('http://a.com/');
			expect(res.status).toEqual(200);
			expect(res.statusText).toEqual('OK');
			expect(await res.text()).toEqual('a string');
		});

		it('respond with an empty string', async () => {
			fm.route('*', '');
			const res = await fm.fetchHandler('http://a.com/');
			expect(res.status).toEqual(200);
			expect(res.statusText).toEqual('OK');
			expect(await res.text()).toEqual('');
		});
	});

	it('respond with a complex response, including headers', async () => {
		fm.route('*', {
			status: 202,
			body: { an: 'object' },
			headers: {
				header: 'val',
			},
		});
		const res = await fm.fetchHandler('http://a.com/');
		expect(res.status).toEqual(202);
		expect(res.headers.get('header')).toEqual('val');
		expect(await res.json()).toEqual({ an: 'object' });
	});
	describe('encoded and streamed data', () => {
		function ab2str(buf) {
			return String.fromCharCode.apply(null, new Uint16Array(buf));
		}

		function str2ab(str) {
			var buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
			var bufView = new Uint16Array(buf);
			for (var i = 0, strLen = str.length; i < strLen; i++) {
				bufView[i] = str.charCodeAt(i);
			}
			return buf;
		}

		it('respond with Blob', async () => {
			const blobParts = ['test value'];
			const body = new Blob(blobParts);
			fm.route('*', body);
			const res = await fm.fetchHandler('http://a.com');
			expect(res.status).to.equal(200);
			const receivedData = await res.blob();
			expect(receivedData).to.eql(body);
			expect(res.headers.get('content-length')).toEqual('10');
		});
		it('respond with ArrayBuffer', async () => {
			const body = str2ab('test value');
			fm.route('*', body);
			const res = await fm.fetchHandler('http://a.com');
			expect(res.status).to.equal(200);
			const receivedData = await res.arrayBuffer();
			expect(ab2str(receivedData)).to.eql('test value');
			expect(res.headers.get('content-length')).toEqual('20');
		});
		it('respond with TypedArray', async () => {
			const buffer = str2ab('test value');
			const body = new Uint8Array(buffer);
			fm.route('*', body);
			const res = await fm.fetchHandler('http://a.com');
			expect(res.status).to.equal(200);
			const receivedData = await res.arrayBuffer();
			expect(new Uint8Array(receivedData)).to.eql(body);
			expect(res.headers.get('content-length')).toEqual('20');
		});
		it('respond with DataView', async () => {
			const buffer = str2ab('test value');
			const body = new DataView(buffer, 0);
			fm.route('*', body);
			const res = await fm.fetchHandler('http://a.com');
			expect(res.status).to.equal(200);
			const receivedData = await res.arrayBuffer();
			expect(new DataView(receivedData, 0)).to.eql(body);
			expect(res.headers.get('content-length')).toEqual('20');
		});

		it('respond with ReadableStream', async () => {
			const body = new Blob(['test value']).stream();
			fm.route('*', body);
			const res = await fm.fetchHandler('http://a.com');
			expect(res.status).to.equal(200);
			const receivedData = await res.text();
			expect(receivedData).to.eql('test value');
			expect(res.headers.get('content-length')).toBe(null);
		});
	});
	describe('structured data', () => {
		it('respond with FormData', async () => {
			const body = new FormData();
			body.append('field', 'value');
			fm.route('*', body);
			const res = await fm.fetchHandler('http://a.com');
			expect(res.status).to.equal(200);
			const receivedData = await res.formData();
			expect(receivedData).to.eql(body);
			expect(res.headers.get('content-length')).toBe(null);
		});
		it('respond with URLSearchParams', async () => {
			const body = new URLSearchParams();
			body.append('field', 'value');
			fm.route('*', body);
			const res = await fm.fetchHandler('http://a.com');
			expect(res.status).to.equal(200);
			const receivedData = await res.formData();
			expect(receivedData.get('field')).to.equal('value');
			expect(res.headers.get('content-length')).toEqual('11');
		});
		describe('json', () => {
			it('respond with a json', async () => {
				fm.route('*', { an: 'object' });
				const res = await fm.fetchHandler('http://a.com/');
				expect(res.status).toEqual(200);
				expect(res.statusText).toEqual('OK');
				expect(res.headers.get('content-type')).toEqual('application/json');
				expect(await res.json()).toEqual({ an: 'object' });
			});

			it('convert body properties to json', async () => {
				fm.route('*', {
					body: { an: 'object' },
				});
				const res = await fm.fetchHandler('http://a.com/');
				expect(res.headers.get('content-type')).toEqual('application/json');
				expect(await res.json()).toEqual({ an: 'object' });
			});

			it('not overide existing content-type-header', async () => {
				fm.route('*', {
					body: { an: 'object' },
					headers: {
						'content-type': 'text/html',
					},
				});
				const res = await fm.fetchHandler('http://a.com/');
				expect(res.headers.get('content-type')).toEqual('text/html');
				expect(await res.json()).toEqual({ an: 'object' });
			});

			it('not convert if `body` property exists', async () => {
				fm.route('*', { body: 'exists' });
				const res = await fm.fetchHandler('http://a.com/');
				expect(res.headers.get('content-type')).not.toEqual('application/json');
			});

			it('not convert if `headers` property exists', async () => {
				fm.route('*', { headers: {} });
				const res = await fm.fetchHandler('http://a.com/');
				expect(res.headers.get('content-type')).toBeNull();
			});

			it('not convert if `status` property exists', async () => {
				fm.route('*', { status: 300 });
				const res = await fm.fetchHandler('http://a.com/');
				expect(res.headers.get('content-type')).toBeNull();
			});

			it('convert if non-whitelisted property exists', async () => {
				fm.route('*', { status: 300, weird: true });
				const res = await fm.fetchHandler('http://a.com/');
				expect(res.headers.get('content-type')).toEqual('application/json');
			});
		});
	});

	it('should set the url property on responses', async () => {
		fm.route('begin:http://foo.com', 200);
		const res = await fm.fetchHandler('http://foo.com/path?query=string');
		expect(res.url).toEqual('http://foo.com/path?query=string');
	});

	it('should set the url property on responses when called with a Request object', async () => {
		fm.route('begin:http://foo.com', 200);
		const res = await fm.fetchHandler(
			new Request('http://foo.com/path?query=string'),
		);
		expect(res.url).toEqual('http://foo.com/path?query=string');
	});
	it('respond with a redirected response', async () => {
		fm.route('*', {
			redirectUrl: 'http://b.com',
			body: 'I am a redirect',
		});
		const res = await fm.fetchHandler('http://a.com/');
		expect(res.redirected).toEqual(true);
		expect(res.url).toEqual('http://b.com');
		expect(await res.text()).toEqual('I am a redirect');
	});

	it('construct a response based on the request', async () => {
		fm.route('*', ({ url, options }) => url + options.headers.header);
		const res = await fm.fetchHandler('http://a.com/', {
			headers: { header: 'val' },
		});
		expect(res.status).toEqual(200);
		expect(await res.text()).toEqual('http://a.com/val');
	});

	it('construct a response based on a Request instance', async () => {
		fm.route('*', ({ request }) => request.json().then(({ a }) => a));
		const res = await fm.fetchHandler(
			new fm.config.Request('http://a.com', {
				body: JSON.stringify({ a: 'b' }),
				method: 'post',
			}),
		);
		expect(res.status).toEqual(200);
		expect(await res.text()).toEqual('b');
	});

	describe('content-length', () => {
		it('should work on body of type string', async () => {
			fm.route('*', 'content');
			const res = await fm.fetchHandler('http://a.com/');
			expect(res.headers.get('content-length')).toEqual('7');
		});

		it('should work on body of type object', async () => {
			fm.route('*', { hello: 'world' });
			const res = await fm.fetchHandler('http://a.com/');
			expect(res.headers.get('content-length')).toEqual('17');
		});

		it('should not overrule explicit mocked content-length header', async () => {
			fm.route('*', {
				body: {
					hello: 'world',
				},
				headers: {
					'Content-Length': '100',
				},
			});
			const res = await fm.fetchHandler('http://a.com/');
			expect(res.headers.get('content-length')).toEqual('100');
		});

		it('should be case-insensitive when checking for explicit content-length header', async () => {
			fm.route('*', {
				body: {
					hello: 'world',
				},
				headers: {
					'CoNtEnT-LeNgTh': '100',
				},
			});
			const res = await fm.fetchHandler('http://a.com/');
			expect(res.headers.get('content-length')).toEqual('100');
		});

		describe('includeContentLength option', () => {
			let fm;
			beforeEach(() => {
				fm = fetchMock.createInstance();
			});
			it('include content-length header by default', async () => {
				fm.route('*', 'content');
				const res = await fm.fetchHandler('http://it.at.there');
				expect(res.headers.get('content-length')).toEqual('7');
			});

			it("don't include when configured false", async () => {
				fm.config.includeContentLength = false;
				fm.route('*', 'content');
				const res = await fm.fetchHandler('http://it.at.there');
				expect(res.headers.get('content-length')).toBeNull();
			});

			it('local setting can override to true', async () => {
				fm.config.includeContentLength = false;
				fm.route('*', 'content', { includeContentLength: true });
				const res = await fm.fetchHandler('http://it.at.there');
				expect(res.headers.get('content-length')).toEqual('7');
			});

			it('local setting can override to false', async () => {
				fm.config.includeContentLength = true;
				fm.route('*', 'content', { includeContentLength: false });
				const res = await fm.fetchHandler('http://it.at.there');
				expect(res.headers.get('content-length')).toBeNull();
			});
		});
	});
});
