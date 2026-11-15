/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeHelpers, type IDataObject, type IHttpRequestOptions, type INodeParameters } from 'n8n-workflow';

import { IvantiNeuronsForItsm } from '../nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node';
import { description, execute } from '../nodes/IvantiNeuronsForITSM/actions/search/savedSearch.operation';
import { fakeExecuteContext, page, type FakeContextOptions } from './context';

const ACTION_ID = '07E1BD1BF5804E67B8E76B26FA6EF9A0';
const ENDPOINT = 'https://tenant.example.com/api/odata/businessobject/Incidents/All_Active_Incidents';
const parameters = {
	searchObject: 'Incidents',
	savedSearchName: 'All_Active_Incidents',
	savedSearchGUID: ACTION_ID,
};
const records = (count: number): IDataObject[] =>
	Array.from({ length: count }, (_, i) => ({ RecId: `rec-${i}`, Subject: `Incident ${i}` }));

/** Reuse the existing execution context, faking only Ivanti's query-sensitive HTTP answer. */
function savedSearchContext(rows: IDataObject[], options: FakeContextOptions = {}) {
	const result = fakeExecuteContext({
		...options,
		typeVersion: options.typeVersion ?? 1.4,
		parameters: { ...parameters, ...options.parameters },
	});
	const send = async (request: IHttpRequestOptions, authenticated: boolean) => {
		result.requests.push({ ...request, qs: { ...(request.qs ?? {}) }, authenticated });
		const skip = Number(request.qs?.$skip ?? 0);
		const top = Number(request.qs?.$top ?? 25);
		return { statusCode: 200, body: JSON.stringify({ value: rows.slice(skip, skip + top) }) };
	};
	result.ctx.helpers.httpRequest = async (request) => send(request, false);
	result.ctx.helpers.httpRequestWithAuthentication = async (_credentialType, request) => send(request, true);
	return result;
}

describe('Saved Search paging', () => {
	it('preserves versions 1–1.3: a single default page still gives 25 of 37 matches', async () => {
		const rows = records(37);
		for (const typeVersion of [1, 1.1, 1.2, 1.3]) {
			const { ctx, requests } = savedSearchContext(rows, { typeVersion });
			const result = await execute.call(ctx);
			assert.deepEqual(result.map((item) => item.json), rows.slice(0, 25));
			assert.equal(result.length === rows.length, false, 'the old output fails the complete 37-record contract');
			assert.deepEqual(requests.map((r) => r.qs), [{ ActionId: ACTION_ID }]);
		}
	});

	it('returns all 37 complete records by default on version 1.4', async () => {
		const rows = records(37);
		const { ctx, requests } = savedSearchContext(rows);
		const result = await execute.call(ctx);
		assert.deepEqual(result.map((item) => item.json), rows);
		for (const item of result) assert.deepEqual(item.pairedItem, { item: 0 });
		assert.deepEqual(requests.map((r) => r.qs), [{ ActionId: ACTION_ID, $top: 100, $skip: 0 }]);
		assert.equal(requests[0].url, ENDPOINT);
	});

	it('returns 137 records over two pages, preserving ActionId, headers and order', async () => {
		const rows = records(137);
		const { ctx, requests } = savedSearchContext(rows, {
			parameters: {
				'requestOptions.overrideHeaders.header': [
					{ name: 'Authorization', value: 'rest_api_key=other' },
					{ name: 'X-Test', value: 'saved-search' },
				],
			},
		});
		const result = await execute.call(ctx);
		assert.deepEqual(result.map((item) => item.json), rows);
		assert.deepEqual(requests.map((r) => r.qs), [0, 100].map(($skip) => ({ ActionId: ACTION_ID, $top: 100, $skip })));
		assert.ok(requests.every((r) => r.url === ENDPOINT && !r.authenticated));
		for (const request of requests) {
			assert.deepEqual(request.headers, { Authorization: 'rest_api_key=other', 'X-Test': 'saved-search' });
		}
	});

	it('honours limits below and above one page', async () => {
		const rows = records(137);
		for (const limit of [10, 37, 120]) {
			const { ctx, requests } = savedSearchContext(rows, { parameters: { returnAll: false, limit } });
			const result = await execute.call(ctx);
			assert.deepEqual(result.map((item) => item.json), rows.slice(0, limit));
			assert.deepEqual(
				requests.map((r) => r.qs),
				limit <= 100
					? [{ ActionId: ACTION_ID, $top: limit }]
					: [{ ActionId: ACTION_ID, $top: 100, $skip: 0 }, { ActionId: ACTION_ID, $top: 20, $skip: 100 }],
			);
		}
	});

	it('terminates at an empty page, including the full-page boundary', async () => {
		for (const count of [0, 100]) {
			const rows = records(count);
			const { ctx, requests } = savedSearchContext(rows);
			const result = await execute.call(ctx);
			assert.deepEqual(result.map((item) => item.json), rows);
			assert.deepEqual(requests.map((r) => r.qs?.$skip), count === 0 ? [0] : [0, 100]);
		}
	});

	it('accepts HTTP 204 as the end of the result set', async () => {
		const { ctx, requests } = fakeExecuteContext({
			typeVersion: 1.4,
			parameters,
			responses: [page(100), { statusCode: 204, body: '' }],
		});
		const result = await execute.call(ctx);
		assert.deepEqual(result.map((item) => item.json.RecId), records(100).map((row) => row.RecId));
		assert.deepEqual(requests.map((r) => r.qs), [0, 100].map(($skip) => ({ ActionId: ACTION_ID, $top: 100, $skip })));
	});

	it('continues after a failed input item and pairs each later record to its own input', async () => {
		const { ctx, requests } = fakeExecuteContext({
			typeVersion: 1.4,
			items: 2,
			continueOnFail: true,
			parameters: { ...parameters, savedSearchGUID: (i: number) => `action-${i}` },
			responses: [{ statusCode: 500, body: '{"message":["Query timed out"]}' }, page(37)],
		});
		const result = await execute.call(ctx);
		assert.equal(result[0].json.httpCode, '500');
		assert.match(String(result[0].json.error), /Query timed out/);
		assert.deepEqual(result[0].pairedItem, { item: 0 });
		assert.equal(result.length, 38);
		for (const item of result.slice(1)) assert.deepEqual(item.pairedItem, { item: 1 });
		assert.deepEqual(requests.map((r) => r.qs?.ActionId), ['action-0', 'action-1']);
	});
});

describe('Saved Search paging in the editor', () => {
	const shown = (name: string, typeVersion: number, values: INodeParameters) =>
		description.filter((p) => p.name === name && NodeHelpers.displayParameter(values, p, { typeVersion }, null));
	const selected = { resource: 'search', operation: 'savedSearch' };

	it('shows the two paging fields only on Saved Search version 1.4', () => {
		for (const typeVersion of [1, 1.1, 1.2, 1.3]) {
			assert.deepEqual(shown('returnAll', typeVersion, selected), []);
			assert.deepEqual(shown('limit', typeVersion, { ...selected, returnAll: false }), []);
		}
		assert.equal(shown('returnAll', 1.4, selected)[0].default, true);
		assert.equal(shown('limit', 1.4, { ...selected, returnAll: false })[0].default, 50);
		assert.deepEqual(shown('limit', 1.4, { ...selected, returnAll: true }), []);
		assert.deepEqual(shown('returnAll', 1.4, { resource: 'search', operation: 'fullTextSearchAcrossAllObjects' }), []);
		assert.deepEqual(shown('returnAll', 1.4, { resource: 'relationship', operation: 'getRelated' }), []);
		assert.deepEqual(new IvantiNeuronsForItsm().description.version, [1, 1.1, 1.2, 1.3, 1.4]);
	});
});
