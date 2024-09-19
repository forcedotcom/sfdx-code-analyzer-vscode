import {expect} from 'chai';

suite('demonstrating issue', () => {

	test('Math still works', () => {
		expect(2 + 2).to.equal(4);
	})

	test('PATH still has the right thing', () => {
		expect(process.env.PATH).to.contain('/Users/runner/hostedtoolcache/node/20.17.0/arm64/bin');
	})
})
