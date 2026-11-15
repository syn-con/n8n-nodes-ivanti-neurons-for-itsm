/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeHelpers, NodeOperationError, type INodeParameters, type INodeProperties } from 'n8n-workflow';

import { description as getManyDescription, execute as getMany } from '../nodes/IvantiNeuronsForITSM/actions/object/getMany.operation';
import { description as getRelatedDescription, execute as getRelated } from '../nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation';
import { buildODataQuery } from '../nodes/IvantiNeuronsForITSM/odata/queryBuilder';
import { fakeExecuteContext, fakePollContext, page, type FakeResponse } from './context';

const url = 'https://tenant.example.com/api/odata/businessobject/Incidents';

function runGetMany(odataQuery: unknown, responses: FakeResponse[], options: { typeVersion?: number; returnAll?: boolean; limit?: number } = {}) {
	const { ctx, requests } = fakeExecuteContext({
		typeVersion: options.typeVersion ?? 1.4,
		responses,
		parameters: {
			object: 'Incidents',
			returnAll: options.returnAll ?? false,
			limit: options.limit ?? 25,
			queryMode: 'json',
			odataQuery,
		},
	});
	return { requests, result: getMany.call(ctx) };
}

/** Rejects with a NodeOperationError whose message and description match. */
function refused(message: string, descriptionPattern: RegExp) {
	return (error: unknown) => {
		assert.ok(error instanceof NodeOperationError, String(error));
		assert.equal(error.message, message);
		assert.match(String(error.description), descriptionPattern);
		return true;
	};
}

describe('Business Object › Get Many: $search in JSON mode (#73)', () => {
	it('sends $search alone on version 1.4', async () => {
		const { requests, result } = runGetMany('{"$search": "printer offline"}', [page(3)]);
		assert.equal((await result).length, 3);
		assert.equal(requests[0].url, url);
		assert.deepEqual(requests[0].qs, { $search: 'printer offline', $top: 25 });
	});

	it('sends $search with $filter, $orderby and $select, spelled freely', async () => {
		const { requests, result } = runGetMany(
			{ Search: 'printer offline', filter: "Status eq 'Closed'", $orderby: 'ResolvedDateTime desc', select: ['RecId', 'Subject', 'Resolution'] },
			[page(2)],
		);
		await result;
		assert.deepEqual(requests[0].qs, {
			$search: 'printer offline',
			$filter: "Status eq 'Closed'",
			$orderby: 'ResolvedDateTime desc',
			$select: 'RecId,Subject,Resolution',
			$top: 25,
		});
	});

	it('pages the hits with Return All', async () => {
		const { requests, result } = runGetMany('{"$search": "printer", "$orderby": "RecId"}', [page(100), page(20, 100)], { returnAll: true });
		assert.equal((await result).length, 120);
		assert.deepEqual(
			requests.map((r) => r.qs),
			[0, 100].map(($skip) => ({ $search: 'printer', $orderby: 'RecId', $top: 100, $skip })),
		);
	});

	it('gives no items and no error for a search with no match (HTTP 200, empty body)', async () => {
		for (const returnAll of [false, true]) {
			const { result } = runGetMany('{"$search": "no-such-word"}', [{ statusCode: 200, body: '' }], { returnAll });
			assert.deepEqual(await result, []);
		}
	});

	it('still refuses $top and $skip', async () => {
		for (const key of ['$top', 'skip']) {
			const { requests, result } = runGetMany(`{"$search": "printer", "${key}": 5}`, []);
			await assert.rejects(result, refused(`"${key}" cannot be set in the OData query`, /Return All and Limit/));
			assert.equal(requests.length, 0);
		}
	});

	it('leaves out an empty $search, and refuses a list', async () => {
		const { requests, result } = runGetMany('{"$search": "  ", "$filter": "Status eq \'Closed\'"}', [page(1)]);
		await result;
		assert.deepEqual(requests[0].qs, { $filter: "Status eq 'Closed'", $top: 25 });

		const empty = runGetMany('{"$search": ""}', []);
		await assert.rejects(empty.result, /The OData Query is empty/);

		const list = runGetMany('{"$search": ["printer", "offline"]}', []);
		await assert.rejects(list.result, /must be text/);
	});

	it('refuses $search on version 1.3, pointing to version 1.4 instead of saying Ivanti does not support it', async () => {
		const { requests, result } = runGetMany('{"$search": "printer"}', [], { typeVersion: 1.3 });
		await assert.rejects(result, (error: unknown) => {
			refused('"$search" cannot be used here', /version 1\.4/)(error);
			assert.doesNotMatch(String((error as NodeOperationError).description), /does not support/);
			return true;
		});
		assert.equal(requests.length, 0);
	});

	it('refuses $search in Get Related and the polling trigger, which were not measured with it', async () => {
		const { ctx } = fakeExecuteContext({
			typeVersion: 1.4,
			parameters: {
				businessObject: 'Incidents',
				recordId: '0123456789ABCDEF0123456789ABCDEF',
				relationship: 'IncidentContainsJournal',
				includeInputFields: false,
				queryMode: 'json',
				odataQuery: '{"$search": "printer"}',
			},
		});
		await assert.rejects(getRelated.call(ctx), refused('"$search" cannot be used here', /Get Many \(node version 1\.4\)/));

		const poll = fakePollContext({ typeVersion: 1.3, parameters: { queryMode: 'json', odataQuery: '{"$search": "printer"}' } });
		assert.throws(() => buildODataQuery.call(poll.ctx, 0, { includeRecId: true }), /"\$search" cannot be used here/);
	});
});

describe('Get Many JSON field in the editor', () => {
	const values = (operation: string): INodeParameters => ({
		resource: operation === 'getMany' ? 'businessobject' : 'relationship',
		operation,
		queryMode: 'json',
	});
	const jsonFields = (properties: INodeProperties[], operation: string, typeVersion: number) =>
		properties.filter((p) => p.name === 'odataQuery' && NodeHelpers.displayParameter(values(operation), p, { typeVersion }, null));

	it('mentions $search only on Get Many version 1.4', () => {
		const v13 = jsonFields(getManyDescription, 'getMany', 1.3);
		const v14 = jsonFields(getManyDescription, 'getMany', 1.4);
		assert.equal(v13.length, 1);
		assert.equal(v14.length, 1);
		assert.doesNotMatch(String(v13[0].description), /\$search/);
		assert.match(String(v14[0].description), /\$search/);
		assert.equal(v14[0].default, v13[0].default);

		const related = jsonFields(getRelatedDescription, 'getRelated', 1.4);
		assert.equal(related.length, 1);
		assert.doesNotMatch(String(related[0].description), /\$search/);
	});
});
