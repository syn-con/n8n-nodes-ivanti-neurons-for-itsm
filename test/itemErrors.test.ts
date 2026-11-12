/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeApiError, NodeOperationError, type INodeExecutionData } from 'n8n-workflow';

import { continueOnFailItem, itemError } from '../nodes/IvantiNeuronsForITSM/actions/itemErrors';
import { execute as getServiceReqParams } from '../nodes/IvantiNeuronsForITSM/actions/serviceReq/getServiceReqParams.operation';
import { fakeExecuteContext, page } from './context';

const GUID = '07E1BD1BF5804E67B8E76B26FA6EF9A0';

/**
 * The check n8n uses to send an item to the error output when On Error is
 * "Continue (using error output)" (packages/core/src/execution-engine/workflow-execute.ts
 * at n8n@2.46.5, lines 3092-3099).
 */
function goesToErrorOutput(item: INodeExecutionData): boolean {
	if (item.error) return true;
	return Boolean(item.json.error) && Object.keys(item.json).every((key) => ['error', 'message', 'details'].includes(key));
}

describe('continueOnFailItem', () => {
	it('pairs the error item to its input item and keeps the HTTP code', () => {
		const { ctx } = fakeExecuteContext();
		const error = new NodeApiError(ctx.getNode(), { message: 'Not found' }, { message: 'Gone', httpCode: '404' });

		const item = continueOnFailItem(error, 2);
		assert.deepEqual(item.json, { error: 'Gone', httpCode: '404' });
		assert.deepEqual(item.pairedItem, { item: 2 });
		assert.equal(item.error, error);
	});

	it('accepts something that is not an Error', () => {
		assert.deepEqual(continueOnFailItem('boom', 0), { json: { error: 'boom' }, pairedItem: { item: 0 } });
	});

	it('sends every failed item to the error output, also with an HTTP code (#63)', () => {
		const { ctx } = fakeExecuteContext();
		const failures: unknown[] = [
			new NodeApiError(ctx.getNode(), { message: 'Bad request' }, { message: 'Rejected', httpCode: '400' }),
			new NodeApiError(ctx.getNode(), { message: 'No reply' }),
			new NodeOperationError(ctx.getNode(), 'Record ID is not valid'),
			new Error('socket hang up'),
			'boom',
		];
		for (const error of failures) {
			assert.equal(goesToErrorOutput(continueOnFailItem(error, 0)), true, String(error));
		}
	});
});

describe('itemError', () => {
	const { ctx } = fakeExecuteContext();

	it('tags a NodeOperationError with the item index', () => {
		const error = itemError.call(ctx, new NodeOperationError(ctx.getNode(), 'Bad'), 3);
		assert.ok(error instanceof NodeOperationError);
		assert.equal(error.context.itemIndex, 3);
	});

	it('keeps an item index that is already set', () => {
		const original = new NodeOperationError(ctx.getNode(), 'Bad', { itemIndex: 1 });
		assert.equal(itemError.call(ctx, original, 3).context.itemIndex, 1);
	});

	it('wraps any other error in a NodeApiError', () => {
		const error = itemError.call(ctx, new Error('socket hang up'), 2);
		assert.ok(error instanceof NodeApiError);
		assert.equal(error.context.itemIndex, 2);
	});
});

describe('per-item errors in an operation', () => {
	// Service Request > Get Service Request Parameters, with the second of three items invalid.
	const options = (continueOnFail: boolean) => ({
		items: 3,
		continueOnFail,
		parameters: { serviceReqTemplateId: (i: number) => (i === 1 ? "x' or RecId ne null or '" : GUID) },
		responses: [page(2), page(1, 2)],
	});

	it('reports the failing item on its own and carries on with Continue On Fail', async () => {
		const { ctx, requests } = fakeExecuteContext(options(true));

		const output = await getServiceReqParams.call(ctx);

		assert.deepEqual(
			output.map((item) => [item.pairedItem, item.json.RecId ?? item.json.error]),
			[
				[{ item: 0 }, 'rec-0'],
				[{ item: 0 }, 'rec-1'],
				[{ item: 1 }, `Invalid record ID (expected a 32-character GUID): "x' or RecId ne null or '"`],
				[{ item: 2 }, 'rec-2'],
			],
		);
		assert.equal(requests.length, 2);
		assert.equal(requests[0].qs?.$filter, `ParentLink_RecID eq '${GUID}'`);
	});

	it('stops at the failing item and names it without Continue On Fail', async () => {
		const { ctx, requests } = fakeExecuteContext(options(false));

		await assert.rejects(getServiceReqParams.call(ctx), (error: unknown) => {
			assert.ok(error instanceof NodeOperationError);
			assert.equal(error.context.itemIndex, 1);
			return true;
		});
		assert.equal(requests.length, 1);
	});
});
