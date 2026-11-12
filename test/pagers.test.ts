/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeApiError } from 'n8n-workflow';

import {
	buildBaseUrl,
	fetchRecords,
	ivantiApiRequest,
	ivantiApiRequestAllItems,
	ivantiApiRequestAllItemsWithLimit,
} from '../nodes/IvantiNeuronsForITSM/transports';
import { fakeExecuteContext, page } from './context';

const endpoint = '/odata/businessobject/Incidents';

describe('ivantiApiRequestAllItems (Return All)', () => {
	it('reads pages of 100 until a short page', async () => {
		const { ctx, requests } = fakeExecuteContext({ responses: [page(100, 0), page(100, 100), page(37, 200)] });

		const records = await ivantiApiRequestAllItems.call(ctx, 'GET', endpoint, { $filter: "Status eq 'Active'" });

		assert.equal(records.length, 237);
		assert.equal(records[236].RecId, 'rec-236');
		assert.deepEqual(
			requests.map((r) => r.qs),
			[0, 100, 200].map(($skip) => ({ $filter: "Status eq 'Active'", $top: 100, $skip })),
		);
		assert.equal(requests[0].url, `https://tenant.example.com/api${endpoint}`);
	});

	it('stops at a 204 with an empty body after a full page', async () => {
		const { ctx, requests } = fakeExecuteContext({ responses: [page(100), { statusCode: 204, body: '' }] });

		const records = await ivantiApiRequestAllItems.call(ctx, 'GET', endpoint);

		assert.equal(records.length, 100);
		assert.equal(requests.length, 2);
	});

	it('returns no records for a 204 on the first page', async () => {
		const { ctx } = fakeExecuteContext({ responses: [{ statusCode: 204, body: '' }] });
		assert.deepEqual(await ivantiApiRequestAllItems.call(ctx, 'GET', endpoint), []);
	});

	it('fails with the HTTP code and Ivanti message when page 2 fails', async () => {
		const { ctx, requests } = fakeExecuteContext({
			responses: [page(100), { statusCode: 500, body: '{"message":["Query timed out"]}' }],
		});

		await assert.rejects(ivantiApiRequestAllItems.call(ctx, 'GET', endpoint), (error: unknown) => {
			assert.ok(error instanceof NodeApiError);
			assert.equal(error.httpCode, '500');
			assert.equal(error.message, 'Ivanti API request failed (HTTP 500): Query timed out');
			return true;
		});
		assert.equal(requests.length, 2);
	});

	it('refuses an answer that is not an OData list', async () => {
		const { ctx } = fakeExecuteContext({ responses: [{ statusCode: 200, body: '{"RecId":"x"}' }] });
		await assert.rejects(ivantiApiRequestAllItems.call(ctx, 'GET', endpoint), /expected an OData list/);
	});
});

describe('ivantiApiRequestAllItemsWithLimit', () => {
	it('asks only for the records still missing', async () => {
		const { ctx, requests } = fakeExecuteContext({ responses: [page(100), page(50, 100)] });

		const records = await ivantiApiRequestAllItemsWithLimit.call(ctx, 'GET', endpoint, {}, undefined, 150);

		assert.equal(records.length, 150);
		assert.deepEqual(
			requests.map((r) => r.qs),
			[
				{ $top: 100, $skip: 0 },
				{ $top: 50, $skip: 100 },
			],
		);
	});

	it('stops early when Ivanti has fewer records than the limit', async () => {
		const { ctx, requests } = fakeExecuteContext({ responses: [page(100), page(100, 100), page(37, 200)] });

		const records = await ivantiApiRequestAllItemsWithLimit.call(ctx, 'GET', endpoint, {}, undefined, 500);

		assert.equal(records.length, 237);
		assert.equal(requests.length, 3);
	});
});

describe('fetchRecords', () => {
	it('sends one request for a limit of 100 or less', async () => {
		const { ctx, requests } = fakeExecuteContext({ responses: [page(30)] });

		const records = await fetchRecords.call(ctx, endpoint, { $orderby: 'Subject asc' }, { returnAll: false, limit: 30 });

		assert.equal(records.length, 30);
		assert.deepEqual(requests.map((r) => r.qs), [{ $orderby: 'Subject asc', $top: 30 }]);
	});

	it('pages for a limit above 100', async () => {
		const { ctx, requests } = fakeExecuteContext({ responses: [page(100), page(20, 100)] });

		await fetchRecords.call(ctx, endpoint, {}, { returnAll: false, limit: 120 });

		assert.deepEqual(requests.map((r) => r.qs?.$top), [100, 20]);
	});

	it('pages through everything with Return All', async () => {
		const { ctx, requests } = fakeExecuteContext({ responses: [page(100), page(1, 100)] });

		const records = await fetchRecords.call(ctx, endpoint, {}, { returnAll: true });

		assert.equal(records.length, 101);
		assert.equal(requests.length, 2);
	});
});

describe('ivantiApiRequest', () => {
	it('uses the credential, or an overridden Authorization header instead', async () => {
		const { ctx, requests } = fakeExecuteContext({
			responses: [{ statusCode: 200, body: '{}' }, { statusCode: 200, body: '{}' }],
		});

		await ivantiApiRequest.call(ctx, 'GET', '/rest/Search');
		await ivantiApiRequest.call(ctx, 'GET', '/rest/Search', {}, undefined, { authorization: 'rest_api_key=other' });

		assert.deepEqual(requests.map((r) => r.authenticated), [true, false]);
		assert.deepEqual(requests[1].headers, { authorization: 'rest_api_key=other' });
	});

	it('uses the /HEAT/api path on premises', () => {
		assert.equal(
			buildBaseUrl({ tenant: 'https://itsm.example.com/', isOnPrem: true }, endpoint),
			`https://itsm.example.com/HEAT/api${endpoint}`,
		);
	});

	it('keeps http:// from the Tenant URL and uses https:// for a bare host name', () => {
		assert.equal(buildBaseUrl({ tenant: 'http://itsm.local:8080/', isOnPrem: true }, endpoint), `http://itsm.local:8080/HEAT/api${endpoint}`);
		assert.equal(buildBaseUrl({ tenant: ' HTTP://itsm.local ' }, endpoint), `http://itsm.local/api${endpoint}`);
		assert.equal(buildBaseUrl({ tenant: 'itsm.example.com' }, endpoint), `https://itsm.example.com/api${endpoint}`);
		assert.equal(buildBaseUrl({ tenant: 'HTTPS://itsm.example.com//' }, endpoint), `https://itsm.example.com/api${endpoint}`);
	});
});
