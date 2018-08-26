---
title: Polyfilling fetch
position: 5
parameters:
  - name:
    content:
content_markdown: |-
	Many older browsers require polyfilling the `fetch` global. The following approaches can be used

	Add the following [polyfill.io](https://polyfill.io/v2/docs/) script to your test page `<script src="https://polyfill.io/v2/polyfill?features=fetch"></script>`
	{: .info}
	`npm install whatwg-fetch` and load `./node_modules/whatwg-fetch/fetch.js` into the page, either in a script tag or by referencing in your test runner config.
	{: .info}
---