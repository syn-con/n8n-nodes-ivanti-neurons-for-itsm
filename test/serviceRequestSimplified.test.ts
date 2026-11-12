/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeApiError, NodeOperationError, type IDataObject, type ILoadOptionsFunctions } from 'n8n-workflow';

import { execute } from '../nodes/IvantiNeuronsForITSM/actions/serviceReq/create.simplified.operation';
import { getServiceRequestParametersSimplifiedSchema } from '../nodes/IvantiNeuronsForITSM/methods/listSearch';
import { fakeExecuteContext, type FakeContextOptions, type FakeResponse, type SentRequest } from './context';

const TEMPLATE = 'A'.repeat(32);
const FIELD = 'B'.repeat(32);
const OTHER_FIELD = 'C'.repeat(32);
const OPTION = 'D'.repeat(32);
const metadataPath = '/odata/businessobject/ServiceReqTemplateParams';
const ok = (body: unknown): FakeResponse => ({ statusCode: 200, body });
const employee = ok({ value: [{ RecId: 'E'.repeat(32) }] });
const subscriptions = ok([{ strRecId: TEMPLATE, strSubscriptionId: 'F'.repeat(32) }]);
const created = ok({ IsSuccess: true });
const field = (id = FIELD, displayName = 'Distribution List [Text]', required = true) =>
	({ id, displayName, required, type: 'string' });
const metadata = (displayType = 'text', id = FIELD) => ({ RecId: id, DisplayType: displayType });

function manual(options: {
	fields?: IDataObject[];
	values?: IDataObject;
	metadata?: IDataObject[];
	metadataResponse?: FakeResponse;
	afterMetadata?: FakeResponse[];
	context?: FakeContextOptions;
} = {}) {
	return fakeExecuteContext({
		...options.context,
		parameters: {
			'serviceReqTemplateId.value': TEMPLATE,
			loginId: 'test@example.invalid',
			mode: 'manual',
			parameters: { schema: options.fields ?? [field()], value: options.values ?? { [FIELD]: 'all-staff' } },
			...options.context?.parameters,
		},
		responses: [employee, subscriptions, options.metadataResponse ?? ok({ value: options.metadata ?? [metadata()] }), ...(options.afterMetadata ?? [created])],
	});
}

function submittedParameters(requests: SentRequest[], index = 0): IDataObject {
	const request = requests.filter(request => request.method === 'POST')[index];
	assert.ok(request, 'Expected a service-request POST');
	return (request.body as IDataObject).parameters as IDataObject;
}

describe('Service Request > Create (Simplified): parameter types (#17)', () => {
	for (const name of ['Distribution List', 'Dropdown explanation', 'Picklist explanation', 'Combo explanation', 'ListName', 'ListMembers']) {
		it(`retains the required text answer for ${name} in a saved mapper schema`, async () => {
			const { ctx, requests } = manual({ fields: [field(FIELD, `${name} [Text]`)], context: { typeVersion: 1 } });

			await execute.call(ctx);

			assert.deepEqual(submittedParameters(requests), { [`par-${FIELD}`]: 'all-staff' });
			assert.equal(requests.some(request => request.url.endsWith('/ValidationList')), false);
			assert.deepEqual(requests.find(request => request.url.endsWith(metadataPath))?.qs, {
				$filter: `ParentLink_RecID eq '${TEMPLATE}'`, $select: 'RecId,DisplayType', $top: 100, $skip: 0,
			});
		});
	}

	it('uses a freshly loaded mapper schema as well as existing saved schemas', async () => {
		const loaded = fakeExecuteContext({ responses: [ok({ value: [{ ...metadata('textarea'), Name: 'ListMembers', RequiredExpression: '$(true)' }] })] });
		const loadCtx = { ...loaded.ctx, getCurrentNodeParameter: () => TEMPLATE } as unknown as ILoadOptionsFunctions;
		const { fields } = await getServiceRequestParametersSimplifiedSchema.call(loadCtx);
		const { ctx, requests } = manual({ fields, metadata: [metadata('textarea')] });
		await execute.call(ctx);
		assert.deepEqual(submittedParameters(requests), { [`par-${FIELD}`]: 'all-staff' });
	});

	it('uses current DisplayType even when a saved label incorrectly says Dropdown', async () => {
		const { ctx, requests } = manual({ fields: [field(FIELD, 'Old label [Dropdown]')] });
		await execute.call(ctx);
		assert.deepEqual(submittedParameters(requests), { [`par-${FIELD}`]: 'all-staff' });
		assert.equal(requests.some(request => request.url.endsWith('/ValidationList')), false);
	});

	for (const displayType of ['combo', 'Dropdown', 'picklist', 'list']) {
		it(`resolves ${displayType} from metadata even with a misleading saved Text label`, async () => {
			const { ctx, requests } = manual({ metadata: [metadata(displayType)], afterMetadata: [ok([[OPTION, 'all-staff']]), created] });
			await execute.call(ctx);
			assert.deepEqual(submittedParameters(requests), { [`par-${FIELD}`]: 'all-staff', [`par-${FIELD}-recId`]: OPTION });
		});
	}

	it('matches an alternate dropdown value and compares metadata IDs without case sensitivity', async () => {
		const { ctx, requests } = manual({
			fields: [field(FIELD.toLowerCase())], values: { [FIELD.toLowerCase()]: 'all-staff' },
			metadata: [metadata('combo')], afterMetadata: [ok([[OPTION, 'All Staff', 'all-staff']]), created],
		});
		await execute.call(ctx);
		assert.equal(submittedParameters(requests)[`par-${FIELD.toLowerCase()}-recId`], OPTION);
	});

	for (const required of [false, true]) {
		it(`refuses an empty validation list for a supplied ${required ? 'required' : 'optional'} dropdown`, async () => {
			const { ctx, requests } = manual({ fields: [field(FIELD, 'Department [Dropdown]', required)], metadata: [metadata('combo')], afterMetadata: [ok([])] });
			await assert.rejects(execute.call(ctx), (error: unknown) => {
				assert.ok(error instanceof NodeOperationError);
				assert.match(error.message, /No validation options.*Department/);
				assert.equal(error.context.itemIndex, 0);
				return true;
			});
			assert.equal(requests.some(request => request.method === 'POST'), false);
		});
	}

	it('treats an empty HTTP 204 validation response as unavailable options', async () => {
		const { ctx } = manual({ metadata: [metadata('combo')], afterMetadata: [{ statusCode: 204 }] });
		await assert.rejects(execute.call(ctx), /No validation options/);
	});

	it('rejects an invalid dropdown answer before submitting', async () => {
		const { ctx, requests } = manual({ metadata: [metadata('combo')], afterMetadata: [ok([[OPTION, 'different']])] });
		await assert.rejects(execute.call(ctx), /is not valid for parameter/);
		assert.equal(requests.some(request => request.method === 'POST'), false);
	});

	for (const value of [undefined, null]) {
		it(`omits an optional ${String(value)} answer without looking up its type or options`, async () => {
			const { ctx, requests } = fakeExecuteContext({
				parameters: { 'serviceReqTemplateId.value': TEMPLATE, loginId: 'test@example.invalid', mode: 'manual', parameters: { schema: [field(FIELD, 'Department [Dropdown]', false)], value: { [FIELD]: value } } },
				responses: [employee, subscriptions, created],
			});
			await execute.call(ctx);
			assert.deepEqual(submittedParameters(requests), {});
			assert.equal(requests.length, 3);
		});
	}

	it('omits an optional blank dropdown but retains blank text, false and zero', async () => {
		const ids = [FIELD, OTHER_FIELD, '1'.repeat(32), '2'.repeat(32)];
		const { ctx, requests } = manual({
			fields: ids.map(id => field(id, id, false)), values: { [ids[0]]: '', [ids[1]]: '', [ids[2]]: false, [ids[3]]: 0 },
			metadata: [metadata('combo', ids[0]), metadata('text', ids[1]), metadata('checkbox', ids[2]), metadata('number', ids[3])],
		});
		await execute.call(ctx);
		assert.deepEqual(submittedParameters(requests), { [`par-${ids[1]}`]: '', [`par-${ids[2]}`]: false, [`par-${ids[3]}`]: 0 });
		assert.equal(requests.some(request => request.url.endsWith('/ValidationList')), false);
	});

	for (const value of [undefined, null, '']) {
		it(`rejects a required dropdown answer that is ${String(value)}`, async () => {
			const { ctx, requests } = manual({ values: { [FIELD]: value }, metadata: [metadata('combo')], afterMetadata: [] });
			await assert.rejects(execute.call(ctx), /is required/);
			assert.equal(requests.some(request => request.method === 'POST'), false);
		});
	}

	for (const fields of [[], [{ RecId: FIELD }]]) {
		it(`fails explicitly when metadata ${fields.length ? 'has no DisplayType' : 'does not contain the supplied parameter'}`, async () => {
			const { ctx, requests } = manual({ metadata: fields, afterMetadata: [] });
			await assert.rejects(execute.call(ctx), /Could not determine the type of parameter/);
			assert.equal(requests.some(request => request.method === 'POST'), false);
		});
	}

	it('caches metadata and validation lists across items without caching their answers', async () => {
		const { ctx, requests } = manual({
			metadata: [metadata('combo')], afterMetadata: [ok([[OPTION, 'first'], [OTHER_FIELD, 'second']]), created, created],
			context: { items: 2, parameters: { parameters: (i: number) => ({ schema: [field()], value: { [FIELD]: i ? 'second' : 'first' } }) } },
		});
		const output = await execute.call(ctx);
		assert.equal(requests.filter(request => request.url.endsWith(metadataPath)).length, 1);
		assert.equal(requests.filter(request => request.url.endsWith('/ValidationList')).length, 1);
		assert.equal(submittedParameters(requests, 0)[`par-${FIELD}-recId`], OPTION);
		assert.equal(submittedParameters(requests, 1)[`par-${FIELD}-recId`], OTHER_FIELD);
		assert.deepEqual(output.map(item => item.pairedItem), [{ item: 0 }, { item: 1 }]);
	});

	it('forwards per-item override headers and isolates metadata and options when they change', async () => {
		const { ctx, requests } = manual({
			metadata: [metadata('combo')],
			afterMetadata: [ok([[OPTION, 'all-staff']]), created, ok({ value: [metadata('combo')] }), ok([[OTHER_FIELD, 'all-staff']]), created],
			context: { items: 2, parameters: { 'requestOptions.overrideHeaders.header': (i: number) => [{ name: 'Authorization', value: `rest_api_key=test-${i}` }] } },
		});
		await execute.call(ctx);
		const lookups = requests.filter(request => request.url.endsWith(metadataPath) || request.url.endsWith('/ValidationList'));
		assert.deepEqual(lookups.map(request => request.headers), [0, 0, 1, 1].map(i => ({ Authorization: `rest_api_key=test-${i}` })));
		assert.ok(lookups.every(request => request.authenticated === false));
		assert.equal(submittedParameters(requests, 1)[`par-${FIELD}-recId`], OTHER_FIELD);
	});

	it('continues with the next item after an unavailable-dropdown error', async () => {
		const { ctx, requests } = manual({
			metadata: [metadata('combo'), metadata('text', OTHER_FIELD)], afterMetadata: [ok([]), created],
			context: { items: 2, continueOnFail: true, parameters: {
				parameters: (i: number) => ({ schema: [field(i ? OTHER_FIELD : FIELD)], value: { [i ? OTHER_FIELD : FIELD]: 'answer' } }),
			} },
		});
		const output = await execute.call(ctx);
		assert.match(String(output[0].json.error), /No validation options/);
		assert.deepEqual(output.map(item => item.pairedItem), [{ item: 0 }, { item: 1 }]);
		assert.deepEqual(submittedParameters(requests), { [`par-${OTHER_FIELD}`]: 'answer' });
	});

	it('propagates a metadata API failure instead of falling back to a saved label', async () => {
		const { ctx, requests } = manual({ metadataResponse: { statusCode: 403, body: '{"message":"Access denied"}' }, afterMetadata: [] });
		await assert.rejects(execute.call(ctx), (error: unknown) => {
			assert.ok(error instanceof NodeApiError);
			assert.equal(error.httpCode, '403');
			return true;
		});
		assert.equal(requests.some(request => request.method === 'POST'), false);
	});

	it('loads a parameter type from the second page of a large template', async () => {
		const firstPage = Array.from({ length: 100 }, (_, i) => metadata('text', i.toString(16).padStart(32, '0')));
		const { ctx, requests } = manual({ metadata: firstPage, afterMetadata: [ok({ value: [metadata()] }), created] });
		await execute.call(ctx);
		assert.deepEqual(requests.filter(request => request.url.endsWith(metadataPath)).map(request => request.qs?.$skip), [0, 100]);
		assert.deepEqual(submittedParameters(requests), { [`par-${FIELD}`]: 'all-staff' });
	});

	it('refuses a missing mapper schema instead of submitting an empty answer set', async () => {
		const { ctx, requests } = manual({ context: { parameters: { parameters: { value: { [FIELD]: 'answer' } } } }, afterMetadata: [] });
		await assert.rejects(execute.call(ctx), /parameter schema is missing/);
		assert.equal(requests.some(request => request.method === 'POST'), false);
	});

	it('keeps JSON mode independent of mapper metadata and preserves RecId pairs', async () => {
		const answers = { [`par-${FIELD}`]: 'all-staff', [`par-${FIELD}-recId`]: OPTION };
		const { ctx, requests } = fakeExecuteContext({
			parameters: { 'serviceReqTemplateId.value': TEMPLATE, loginId: 'test@example.invalid', mode: 'json', jsonParameters: JSON.stringify(answers) },
			responses: [employee, subscriptions, created],
		});
		await execute.call(ctx);
		assert.deepEqual(submittedParameters(requests), answers);
		assert.equal(requests.length, 3);
	});
});
