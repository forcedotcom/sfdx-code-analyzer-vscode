import {expect} from 'chai';

suite('demoing issue', () => {
	test('path is changed', () => {
		expect(process.env.PATH).to.contain('/Users/runner/hostedtoolcache/node/20.17.0/arm64/bin');
	})
})
