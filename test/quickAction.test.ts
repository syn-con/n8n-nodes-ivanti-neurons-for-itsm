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

/** JSON mode unless the test sets another Prompt Mode. */
function context(extra: Record<string, unknown> = {}, options: FakeContextOptions = {}) {
	return fakeExecuteContext({ responses: [{ statusCode: 200, body: '' }], ...options, parameters: { ...parameters, promptMode: 'json', ...extra } });
}

describe('Quick Action prompts in Manual mode', () => {
	const manual = (rows: unknown, extra: Record<string, unknown> = {}, options: FakeContextOptions = {}) =>
		context({ promptMode: 'manual', 'manualPrompts.prompt': rows, ...extra }, options);

	it('keeps the legacy body without prompt rows, also when Prompt Mode is not saved', async () => {
		for (const ctxOf of [manual([]), fakeExecuteContext({ responses: [{ statusCode: 200, body: '' }], parameters })]) {
			await execute.call(ctxOf.ctx);
			assert.deepEqual(ctxOf.requests[0].body, legacyBody);
		}
	});

	it('builds one PromptData entry per row for the record', async () => {
		const { ctx, requests } = manual([{ fieldName: ' Status ', value: 'Closed' }, { fieldName: 'Resolution', value: '' }]);
		await execute.call(ctx);
		const expected: IDataObject = {
			...legacyBody,
			PromptParams: [
				{
					__type: 'DataLayer.PromptData', ActionId: null, ActionObjectId: null, PromptObjectId: recordId,
					ActionObjectType: 'Incident#', PromptObjectType: 'Incident#', Value: 'Closed', FieldName: 'Status', IsNewPrompt: true,
				},
				{
					__type: 'DataLayer.PromptData', ActionId: null, ActionObjectId: null, PromptObjectId: recordId,
					ActionObjectType: 'Incident#', PromptObjectType: 'Incident#', Value: '', FieldName: 'Resolution', IsNewPrompt: true,
				},
			],
		};
		delete expected.promptParams;
		assert.deepEqual(requests[0].body, expected);
	});

	it('uses each item record and object type, and keeps value types', async () => {
		const { ctx, requests } = manual(
			(i: number) => [{ fieldName: 'Flag', value: i === 0 ? false : 0 }],
			{ businessObject: 'Tasks', recordId: (i: number) => String(i).repeat(32) },
			{ items: 2, responses: [{ statusCode: 200, body: '' }, { statusCode: 200, body: '' }] },
		);
		const output = await execute.call(ctx);
		for (let i = 0; i < 2; i++) {
			const [prompt] = (requests[i].body as IDataObject).PromptParams as IDataObject[];
			assert.equal(prompt.PromptObjectId, String(i).repeat(32));
			assert.equal(prompt.PromptObjectType, 'Task#');
			assert.equal(prompt.ActionObjectType, 'Task#');
			assert.equal(prompt.Value, i === 0 ? false : 0);
			assert.deepEqual(output[i].pairedItem, { item: i });
		}
	});

	it('ignores the JSON mode fields', async () => {
		const { ctx, requests } = manual([], { promptParams: [{ FieldName: 'Status', Value: 'x' }] });
		await execute.call(ctx);
		assert.deepEqual(requests[0].body, legacyBody);
	});

	for (const rows of [null, [null], [{}], [{ fieldName: ' ', value: 'x' }], [{ fieldName: 'Status', value: NaN }], [{ fieldName: 'Status', value: 'a' }, { fieldName: 'status', value: 'b' }]]) {
		it(`refuses invalid prompt rows ${JSON.stringify(rows)} before sending`, async () => {
			const { ctx, requests } = manual(rows);
			await assert.rejects(execute.call(ctx), NodeOperationError);
			assert.equal(requests.length, 0);
		});
	}
});

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

	it('reads the prompts and record identity separately for each input item', async () => {
		const { ctx, requests } = context({
			recordId: (i: number) => String(i).repeat(32),
			promptParams: (i: number) => [{ FieldName: 'Resolution', Value: `answer-${i}` }],
		}, { items: 2, responses: [{ statusCode: 200, body: '' }, { statusCode: 200, body: '' }] });
		const output = await execute.call(ctx);
		for (let i = 0; i < 2; i++) {
			assert.equal(((requests[i].body as IDataObject).PromptParams as IDataObject[])[0].Value, `answer-${i}`);
			assert.match(requests[i].url, new RegExp(String(i).repeat(32)));
			assert.deepEqual(output[i].pairedItem, { item: i });
		}
	});

	it('uses the shared object-type conversion and per-item header overrides', async () => {
		const { ctx, requests } = context({
			businessObject: 'Tasks',
			promptParams: [{ FieldName: 'Status', Value: 'Completed' }],
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
	it('refuses an unknown Prompt Mode before sending', async () => {
		const { ctx, requests } = context({ promptMode: 'other' });
		await assert.rejects(execute.call(ctx), /Unknown Prompt Mode: other/);
		assert.equal(requests.length, 0);
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
	it('runs the documented JSON template through n8n', async () => {
		const example = readFileSync('docs/quick-action-prompts.md', 'utf8').match(/```javascript\r?\n([\s\S]*?)\r?\n```/);
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
		const { ctx, requests } = context({ promptParams: template });
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
		for (const promptMode of ['manual', 'json']) {
			const evaluate = (i: number) => workflow.expression.getParameterValue(
				promptMode === 'manual'
					? [{ fieldName: 'Resolution', value: '={{ $json.answer }}' }]
					: '={{ [{ FieldName: "Resolution", Value: $json.answer }] }}',
				null, 0, i, node.name, items, 'manual', {},
			);
			const { ctx, requests } = context({ promptMode, [promptMode === 'manual' ? 'manualPrompts.prompt' : 'promptParams']: evaluate }, {
				inputItems: items, responses: values.map(() => ({ statusCode: 200, body: '' })),
			});
			await execute.call(ctx);
			assert.deepEqual(requests.map((request) => ((request.body as IDataObject).PromptParams as IDataObject[])[0].Value), values, promptMode);
		}
	});

	it('shows each prompt control only for Quick Action Run in its mode', () => {
		const shown = (name: string, resource: string, operation: string, promptMode: string) => NodeHelpers.displayParameter(
			{ resource, operation, promptMode }, description.find((p) => p.name === name)!, { typeVersion: 1.3 }, null,
		);
		assert.equal(description.some((p) => p.name === 'promptResponses'), false);
		for (const [name, mode, other] of [['promptParams', 'json', 'manual'], ['manualPrompts', 'manual', 'json'], ['promptMode', 'manual', null]] as const) {
			assert.equal(shown(name, 'quickAction', 'run', mode), true, name);
			if (other) assert.equal(shown(name, 'quickAction', 'run', other), false, name);
			assert.equal(shown(name, 'businessobject', 'create', mode), false, name);
			assert.equal(shown(name, 'quickAction', 'other', mode), false, name);
		}
		assert.equal(description.find((p) => p.name === 'promptMode')!.default, 'manual');
	});

	it('offers Add Prompt with exactly two expression-enabled fields', () => {
		const collection = description.find((p) => p.name === 'manualPrompts')!;
		assert.equal(collection.placeholder, 'Add Prompt');
		assert.equal(collection.typeOptions?.multipleValues, true);
		const fields = (collection.options![0] as INodePropertyCollection).values;
		assert.deepEqual(fields.map((p) => p.name), ['fieldName', 'value']);
		for (const field of fields) assert.notEqual(field.noDataExpression, true);
		assert.equal(fields[1].ignoreValidationDuringExecution, true);
		assert.notEqual(description.find((p) => p.name === 'promptParams')!.noDataExpression, true);
		assert.equal(new IvantiNeuronsForItsm().description.usableAsTool, true);
	});
});
