export PATH := $(PATH):./node_modules/.bin

.PHONY: test

test-dev:
	karma start --browsers=Chrome

test-chrome:
	karma start --single-run --browsers=Chrome

test-firefox:
	karma start --single-run --browsers=Firefox

test-unit:
	mocha test/server.js

test-node6: transpile
	node test/node6.js

lint:
	./node_modules/.bin/eslint --ignore-pattern test/fixtures/* src test

coverage-report:
	nyc --reporter=lcovonly --reporter=text mocha test/server.js
	cat ./coverage/lcov.info | coveralls

local-coverage:
	nyc --reporter=html --reporter=text mocha test/server.js

transpile:
	babel src --out-dir es5

bundle:
	webpack --mode development \
	--output-library fetchMock \
	--entry ./es5/client.js \
	--output-filename ./es5/client-bundle.js
