/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use Node built-ins */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { NodeHelpers, NodeOperationError, Workflow, type IDataObject, type INode, type INodePropertyCollection } from 'n8n-workflow';

import { IvantiNeuronsForItsm } from '../nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node';
import { description, execute } from '../nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation';
import { fakeExecuteContext, type FakeContextOptions } from './context';

const recordId = '0123456789ABCDEF0123456789ABCDEF';
const actionId = '11111111-2222-3333-4444-555555555555';
const parameters = { businessObject: 'Incidents', recordId, quickAction: 'Resolve_Incident', quickActionId: actionId };
const legacyBody = {
	ActionId: actionId,
	ShouldSave: true,
	ActionParams: { GridParams: null, FormParams: { actionId, objectId: recordId, actualObjectType: 'Incident#' } },
	promptParams: null,
};

function context(extra: Record<string, unknown> = {}, options: FakeContextOptions = {}) {
	return fakeExecuteContext({ responses: [{ statusCode: 200, body: '' }], ...options, parameters: { ...parameters, ...extra } });
}

describe('Quick Action prompt requests', () => {
	it('keeps the complete legacy body when saved workflows have no new parameters', async () => {
		for (const typeVersion of [1, 1.1, 1.2, 1.3]) {
			const { ctx, requests } = context({}, { typeVersion });
			await execute.call(ctx);
			assert.deepEqual(requests[0].body, legacyBody);
			assert.equal(requests[0].method, 'POST');
			assert.equal(requests[0].url, `https://tenant.example.com/api/odata/businessobject/Incidents('${recordId}')/Resolve_Incident`);
			assert.equal(requests[0].authenticated, true);
		}
	});

	for (const raw of ['', '  ', '[]', [], undefined]) {
		it(`keeps the legacy body for empty JSON input ${JSON.stringify(raw)}`, async () => {
			const { ctx, requests } = context({ promptParams: raw });
			await execute.call(ctx);
			assert.deepEqual(requests[0].body, legacyBody);
		});
	}

	for (const asText of [true, false]) {
		it(`preserves complete JSON metadata and value types from ${asText ? 'text' : 'an expression array'}`, async () => {
			const prompts = ['text', false, 0, 12.5, null, '', { nested: [false, 0, null] }].map((Value, i) => ({
				FieldName: `Field${i}`, Value, __type: 'DataLayer.PromptData', Hidden: i === 0,
				ActionId: null, ActionObjectId: null, ExtraMetadata: { keep: true },
			}));
			const snapshot = JSON.stringify(prompts);
			const { ctx, requests } = context({ promptParams: asText ? snapshot : prompts });
			await execute.call(ctx);
			const expected: IDataObject = { ...legacyBody, PromptParams: prompts };
			delete expected.promptParams;
			assert.deepEqual(requests[0].body, expected);
			assert.equal(Object.prototype.hasOwnProperty.call(requests[0].body, 'promptParams'), false);
			assert.equal(JSON.stringify(prompts), snapshot, 'input metadata must not be mutated');
		});
	}

	it('retains repeated field names with different sub-action metadata in JSON mode', async () => {
		const prompts = [{ FieldName: 'Note', Value: 'first', ActionId: 'child-1' }, { FieldName: 'Note', Value: 'second', ActionId: 'child-2' }];
		const { ctx, requests } = context({ promptParams: prompts });
		await execute.call(ctx);
		assert.deepEqual((requests[0].body as IDataObject).PromptParams, prompts);
	});

	it('maps two visible answers while preserving all five entries and their metadata', async () => {
		const prompts = [
			{ FieldName: 'ActualCategory', Value: 'How-To', Hidden: true, ActionId: null },
			{ FieldName: 'ActualService', Value: 'Service Desk', Hidden: true, ActionId: null },
			{ FieldName: 'Status', Value: 'Resolved', Hidden: true, ActionId: null },
			{ FieldName: 'CauseCode', Value: null, Hidden: false, ActionId: actionId, ValidList: 'Incident Cause Code' },
			{ FieldName: 'Resolution', Value: null, Hidden: false, ActionId: actionId, CustomMetadata: { keep: true } },
		];
		const snapshot = JSON.stringify(prompts);
		const rows = [
			{ fieldName: 'CauseCode', value: 'Documentation Request' },
			{ fieldName: 'Resolution', value: 'Generated answer — "quotes"\nand another line' },
		];
		const { ctx, requests } = context({ promptParams: prompts, 'promptResponses.responses': rows });
		await execute.call(ctx);
		assert.deepEqual((requests[0].body as IDataObject).PromptParams, [
			...prompts.slice(0, 3),
			{ ...prompts[3], Value: rows[0].value },
			{ ...prompts[4], Value: rows[1].value },
		]);
		assert.equal(JSON.stringify(prompts), snapshot, 'template must not be mutated');
	});

	it('preserves false, zero, null and empty string in field response expressions', async () => {
		const values = [false, 0, null, '', 'null', 'false', '0'];
		const { ctx, requests } = context({ promptParams: values.map((_, i) => ({ FieldName: `Field${i}`, Value: 'previous' })), 'promptResponses.responses': values.map((value, i) => ({ fieldName: ` Field${i} `, value })) });
		await execute.call(ctx);
		const prompts = (requests[0].body as IDataObject).PromptParams as IDataObject[];
		assert.deepEqual(prompts.map((p) => p.Value), values);
		assert.deepEqual(prompts.map((p) => p.FieldName), values.map((_, i) => `Field${i}`));
	});

	it('reads responses and record identity separately for each input item', async () => {
		for (const useOverrides of [true, false]) {
			const { ctx, requests } = context({
				recordId: (i: number) => String(i).repeat(32),
				promptParams: (i: number) => [{ FieldName: 'Resolution', Value: useOverrides ? null : `answer-${i}` }],
				'promptResponses.responses': (i: number) => useOverrides ? [{ fieldName: 'Resolution', value: `answer-${i}` }] : [],
			}, { items: 2, responses: [{ statusCode: 200, body: '' }, { statusCode: 200, body: '' }] });
			const output = await execute.call(ctx);
			for (let i = 0; i < 2; i++) {
				assert.equal(((requests[i].body as IDataObject).PromptParams as IDataObject[])[0].Value, `answer-${i}`);
				assert.match(requests[i].url, new RegExp(String(i).repeat(32)));
				assert.deepEqual(output[i].pairedItem, { item: i });
			}
		}
	});

	it('uses the shared object-type conversion and per-item header overrides', async () => {
		const { ctx, requests } = context({
			businessObject: 'Tasks',
			promptParams: [{ FieldName: 'Status', Value: null }],
			'promptResponses.responses': [{ fieldName: 'Status', value: 'Completed' }],
			'requestOptions.overrideHeaders.header': [{ name: 'Authorization', value: 'test-override' }],
		}, { isOnPrem: true });
		await execute.call(ctx);
		assert.equal(requests[0].authenticated, false);
		assert.equal(requests[0].headers?.Authorization, 'test-override');
		assert.match(requests[0].url, /\/HEAT\/api\//);
		const actionParams = (requests[0].body as IDataObject).ActionParams as IDataObject;
		assert.equal((actionParams.FormParams as IDataObject).actualObjectType, 'Task#');
	});
});

describe('Quick Action prompt validation', () => {
	it('requires metadata for response rows instead of guessing prompt identity', async () => {
		const { ctx, requests } = context({ 'promptResponses.responses': [{ fieldName: 'Resolution', value: 'answer' }] });
		await assert.rejects(execute.call(ctx), /require a Prompt Parameters JSON template/);
		assert.equal(requests.length, 0);
	});

	it('rejects unmatched and ambiguous field overrides before sending', async () => {
		for (const prompts of [
			[{ FieldName: 'OtherField', Value: null }],
			[{ FieldName: 'resolution', Value: null }],
			[{ FieldName: 'Resolution', Value: null, ActionId: 'child-1' }, { FieldName: 'Resolution', Value: null, ActionId: 'child-2' }],
		]) {
			const { ctx, requests } = context({ promptParams: prompts, 'promptResponses.responses': [{ fieldName: 'Resolution', value: 'answer' }] });
			await assert.rejects(execute.call(ctx), /no matching FieldName|matches multiple prompt entries/);
			assert.equal(requests.length, 0);
		}
	});

	const circular: Record<string, unknown> = {};
	circular.self = circular;
	const badJson: Array<[string, unknown, RegExp]> = [
		['malformed JSON', '[', /valid JSON/],
		['object', {}, /JSON array/],
		['number', 4, /JSON array/],
		['boolean', false, /JSON array/],
		['null expression', null, /JSON array/],
		['null JSON', 'null', /JSON array/],
		['null entry', [null], /entry 1 must be a JSON object/],
		['array entry', [[]], /entry 1 must be a JSON object/],
		['string entry', ['x'], /entry 1 must be a JSON object/],
		['missing field', [{ Value: 'x' }], /non-empty FieldName/],
		['blank field', [{ FieldName: ' ', Value: 'x' }], /non-empty FieldName/],
		['missing value', [{ FieldName: 'Resolution' }], /must have a Value/],
		['undefined value', [{ FieldName: 'Resolution', Value: undefined }], /only JSON values/],
		['non-finite value', [{ FieldName: 'Resolution', Value: NaN }], /only JSON values/],
		['date value', [{ FieldName: 'Resolution', Value: new Date() }], /only JSON values/],
		['circular metadata', [{ FieldName: 'Resolution', Value: 'x', extra: circular }], /only JSON values/],
		['undefined metadata', [{ FieldName: 'Resolution', Value: null, extra: undefined }], /only JSON values/],
	];
	for (const [name, promptParams, message] of badJson) {
		it(`refuses ${name} before sending an HTTP request`, async () => {
			const { ctx, requests } = context({ promptParams });
			await assert.rejects(execute.call(ctx), (error: unknown) => {
				assert.ok(error instanceof NodeOperationError);
				assert.match(error.message, message);
				assert.equal(error.context.itemIndex, 0);
				return true;
			});
			assert.equal(requests.length, 0);
		});
	}

	for (const rows of [null, {}, [null], [{}], [{ fieldName: 'Resolution' }], [{ fieldName: 'Resolution', value: undefined }], [{ fieldName: 'Resolution', value: Infinity }], [{ fieldName: 'Resolution', value: '' }, { fieldName: ' resolution ', value: '' }]]) {
		it(`refuses invalid response rows ${JSON.stringify(rows)}`, async () => {
			const { ctx, requests } = context({ promptParams: [{ FieldName: 'Resolution', Value: null }], 'promptResponses.responses': rows });
			await assert.rejects(execute.call(ctx), NodeOperationError);
			assert.equal(requests.length, 0);
		});
	}

	it('reports the invalid entry index without including its answer', async () => {
		const { ctx } = context({ promptParams: [{ FieldName: 'Resolution', Value: '' }, { FieldName: '', Value: 'private-answer' }] });
		await assert.rejects(execute.call(ctx), (error: Error) => {
			assert.match(error.message, /entry 2/);
			assert.doesNotMatch(error.message, /private-answer/);
			return true;
		});
	});

	it('continues after a bad item without sending it and preserves item linking', async () => {
		const { ctx, requests } = context({ promptParams: (i: number) => i === 0 ? [{}] : [{ FieldName: 'Resolution', Value: 'ok' }] }, {
			items: 2, continueOnFail: true,
		});
		const output = await execute.call(ctx);
		assert.equal(requests.length, 1);
		assert.match(String(output[0].json.error), /entry 1/);
		assert.deepEqual(output[0].pairedItem, { item: 0 });
		assert.deepEqual(output[1], { json: {}, pairedItem: { item: 1 } });
	});
});

describe('Quick Action output', () => {
	for (const body of ['', '  ', undefined, null]) {
		for (const statusCode of [200, 204]) {
			it(`returns one linked empty object for HTTP ${statusCode} with ${JSON.stringify(body)}`, async () => {
				const { ctx, requests } = context({}, { responses: [{ statusCode, body }] });
				assert.deepEqual(await execute.call(ctx), [{ json: {}, pairedItem: { item: 0 } }]);
				assert.equal(requests.length, 1, 'an empty success must not retry the action');
			});
		}
	}
	it('preserves a non-empty JSON response', async () => {
		const { ctx } = context({}, { responses: [{ statusCode: 200, body: '{"result":"accepted"}' }] });
		assert.deepEqual(await execute.call(ctx), [{ json: { result: 'accepted' }, pairedItem: { item: 0 } }]);
	});
	it('reports an Ivanti failure without retrying the action', async () => {
		const { ctx, requests } = context({}, { continueOnFail: true, responses: [{ statusCode: 400, body: '{"code":"ISM_4000","message":["Required prompt missing"]}' }] });
		const [output] = await execute.call(ctx);
		assert.match(String(output.json.error), /Required prompt missing/);
		assert.deepEqual(output.pairedItem, { item: 0 });
		assert.equal(requests.length, 1);
	});
});

describe('Quick Action prompt editor and tool properties', () => {
	it('runs the documented template and two response expressions through n8n', async () => {
		const example = readFileSync('docs/quick-action-prompts.md', 'utf8').match(/```javascript\n([\s\S]*?)\n```/);
		assert.ok(example);
		const node: INode = {
			id: 'resolve', name: 'Resolve', type: 'ivanti', typeVersion: 1.3, position: [0, 0],
			parameters: { resource: 'quickAction', operation: 'run', ...parameters, recordId: '={{ $json.RecId }}' },
		};
		const nodeType = new IvantiNeuronsForItsm();
		const workflow = new Workflow({
			nodes: [node], connections: {}, active: false,
			nodeTypes: { getByName: () => nodeType, getByNameAndVersion: () => nodeType, getKnownTypes: () => ({}) },
		});
		const items = [{ json: { RecId: recordId, Category: 'How-To', Service: 'Service Desk', causeCode: 'Documentation Request', generatedResolution: 'Generated answer' } }];
		const template = workflow.expression.getParameterValue('=' + example[1], null, 0, 0, node.name, items, 'manual', {});
		const rows = workflow.expression.getParameterValue([
			{ fieldName: 'CauseCode', value: '={{ $json.causeCode }}' },
			{ fieldName: 'Resolution', value: '={{ $json.generatedResolution }}' },
		], null, 0, 0, node.name, items, 'manual', {});
		const { ctx, requests } = context({ promptParams: template, 'promptResponses.responses': rows });
		await execute.call(ctx);
		const prompts = (requests[0].body as IDataObject).PromptParams as IDataObject[];
		assert.deepEqual(prompts.map((p) => [p.FieldName, p.Value]), [
			['ActualCategory', 'How-To'], ['ActualService', 'Service Desk'], ['Status', 'Resolved'],
			['CauseCode', 'Documentation Request'], ['Resolution', 'Generated answer'],
		]);
		assert.ok(prompts.every((p) => p.PromptObjectId === recordId));
		assert.equal(prompts[3].ActionId, actionId);
	});

	it('evaluates workflow expressions per item without turning primitive answers into strings', async () => {
		const node: INode = { id: 'resolve', name: 'Resolve', type: 'ivanti', typeVersion: 1.3, position: [0, 0], parameters: {} };
		const nodeType = new IvantiNeuronsForItsm();
		const workflow = new Workflow({
			nodes: [node], connections: {}, active: false,
			nodeTypes: { getByName: () => nodeType, getByNameAndVersion: () => nodeType, getKnownTypes: () => ({}) },
		});
		const values = ['generated text', false, 0, null, ''];
		const items = values.map((answer) => ({ json: { answer } }));
		for (const useOverrides of [true, false]) {
			const evaluate = (i: number) => workflow.expression.getParameterValue(
				useOverrides
					? [{ fieldName: 'Resolution', value: '={{ $json.answer }}' }]
					: '={{ [{ FieldName: "Resolution", Value: $json.answer }] }}',
				null, 0, i, node.name, items, 'manual', {},
			);
			const { ctx, requests } = context({ promptParams: useOverrides ? [{ FieldName: 'Resolution', Value: 'previous' }] : evaluate, 'promptResponses.responses': useOverrides ? evaluate : [] }, {
				inputItems: items, responses: values.map(() => ({ statusCode: 200, body: '' })),
			});
			await execute.call(ctx);
			assert.deepEqual(requests.map((request) => ((request.body as IDataObject).PromptParams as IDataObject[])[0].Value), values);
		}
	});

	it('shows both prompt controls only for Quick Action Run', () => {
		const shown = (name: string, resource: string, operation: string) => NodeHelpers.displayParameter(
			{ resource, operation }, description.find((p) => p.name === name)!, { typeVersion: 1.3 }, null,
		);
		for (const name of ['promptResponses', 'promptParams']) {
			assert.equal(shown(name, 'quickAction', 'run'), true);
			assert.equal(shown(name, 'businessobject', 'create'), false);
			assert.equal(shown(name, 'quickAction', 'other'), false);
		}
	});

	it('offers Add Prompt Response with exactly two expression-enabled fields', () => {
		const collection = description.find((p) => p.name === 'promptResponses')!;
		assert.equal(collection.placeholder, 'Add Prompt Response');
		assert.equal(collection.typeOptions?.multipleValues, true);
		const fields = (collection.options![0] as INodePropertyCollection).values;
		assert.deepEqual(fields.map((p) => p.name), ['fieldName', 'value']);
		for (const field of fields) assert.notEqual(field.noDataExpression, true);
		assert.equal(fields[1].ignoreValidationDuringExecution, true);
		assert.notEqual(description.find((p) => p.name === 'promptParams')!.noDataExpression, true);
		assert.equal(new IvantiNeuronsForItsm().description.usableAsTool, true);
	});
});
