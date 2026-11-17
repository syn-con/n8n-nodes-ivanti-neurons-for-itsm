/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { execute } from '../nodes/IvantiNeuronsForITSM/actions/object/getMetadata.operation';
import { fakeExecuteContext } from './context';

const metadata = {
	BusinessObject: {
		TableName: 'Incident',
		Fields: [{ FieldName: 'RecId', DisplayName: 'RecId', DataType: 'FixedText', Length: 32 }],
		LinkedObjects: [],
	},
};

describe('Business Object › Get Metadata', () => {
	it('sends GET /rest/GetBusinessObjectMetadata with the business object in the body', async () => {
		const { ctx, requests } = fakeExecuteContext({
			parameters: { metadataObject: 'Incident#' },
			responses: [{ statusCode: 200, body: JSON.stringify(metadata) }],
		});
		const result = await execute.call(ctx);
		assert.equal(requests.length, 1);
		assert.equal(requests[0].method, 'GET');
		assert.equal(requests[0].url, 'https://tenant.example.com/api/rest/GetBusinessObjectMetadata');
		assert.deepEqual(requests[0].body, { BusinessObject: 'Incident#' });
		assert.equal(result.length, 1);
		assert.deepEqual(result[0].json, metadata);
		assert.deepEqual(result[0].pairedItem, { item: 0 });
	});

	it('trims the name', async () => {
		const { ctx, requests } = fakeExecuteContext({
			parameters: { metadataObject: ' Change# ' },
			responses: [{ statusCode: 200, body: '{}' }],
		});
		await execute.call(ctx);
		assert.deepEqual(requests[0].body, { BusinessObject: 'Change#' });
	});

	it('sends a subtype name such as CI#Computer as written', async () => {
		for (const metadataObject of ['CI#Computer', 'frs_knowledge#Document']) {
			const { ctx, requests } = fakeExecuteContext({
				parameters: { metadataObject },
				responses: [{ statusCode: 200, body: '{}' }],
			});
			await execute.call(ctx);
			assert.deepEqual(requests[0].body, { BusinessObject: metadataObject });
		}
	});

	it('refuses a name without a #', async () => {
		for (const metadataObject of ['Incident', 'Incidents', 'CIComputer']) {
			const { ctx, requests } = fakeExecuteContext({ parameters: { metadataObject } });
			await assert.rejects(execute.call(ctx), /must contain a "#"/);
			assert.equal(requests.length, 0);
		}
	});

	it('refuses an empty or unsafe name without sending a request', async () => {
		for (const metadataObject of ['', '   ', '#', '#Computer', 'CI#Computer#', 'CI#Com puter', 'Inci dent#', 'Incident"#', 'CI#Computer/x']) {
			const { ctx, requests } = fakeExecuteContext({ parameters: { metadataObject } });
			await assert.rejects(execute.call(ctx));
			assert.equal(requests.length, 0);
		}
	});

	it('returns an empty item for an empty reply', async () => {
		const { ctx } = fakeExecuteContext({
			parameters: { metadataObject: 'Incident#' },
			responses: [{ statusCode: 204, body: '' }],
		});
		const result = await execute.call(ctx);
		assert.deepEqual(result[0].json, {});
	});

	it('keeps going with continueOnFail', async () => {
		const { ctx } = fakeExecuteContext({
			continueOnFail: true,
			parameters: { metadataObject: 'Nope#' },
			responses: [{ statusCode: 400, body: '{"message":"Business object not found"}' }],
		});
		const result = await execute.call(ctx);
		assert.equal(result.length, 1);
		assert.match(String(result[0].json.error), /Business object not found|HTTP 400/);
	});
});
