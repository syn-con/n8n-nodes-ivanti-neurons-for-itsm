/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeHelpers, type INodeParameters, type INodeProperties } from 'n8n-workflow';

import { IvantiNeuronsForItsm } from '../nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node';
import { IvantiNeuronsForItsmTrigger } from '../nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node';
import { buildODataQuery } from '../nodes/IvantiNeuronsForITSM/odata/queryBuilder';
import { odataListProperties } from '../nodes/IvantiNeuronsForITSM/odata/queryProperties';
import { fakeExecuteContext, fakePollContext } from './context';

const odataMode = (parameters: Record<string, unknown>, typeVersion = 1.3) =>
	fakeExecuteContext({ typeVersion, parameters: { queryMode: 'odata', ...parameters } }).ctx;

describe('OData mode (version 1.3)', () => {
	it('sends only $filter when only Filter is set', () => {
		const ctx = odataMode({ odataFilterExpression: "Status eq 'Active'", odataSelect: '', odataOrderBy: '  ' });
		assert.deepEqual(buildODataQuery.call(ctx, 0), { $filter: "Status eq 'Active'" });
	});

	it('sends every field that is set, as written', () => {
		const ctx = odataMode({
			odataFilterExpression: " Status eq 'Active' and Priority le 2 ",
			odataSelect: 'RecId,Subject',
			odataOrderBy: 'CreatedDateTime desc,RecId',
		});
		assert.deepEqual(buildODataQuery.call(ctx, 0), {
			$filter: "Status eq 'Active' and Priority le 2",
			$select: 'RecId,Subject',
			$orderby: 'CreatedDateTime desc,RecId',
		});
	});

	it('sends no option when every field is empty', () => {
		assert.deepEqual(buildODataQuery.call(odataMode({}), 0), {});
	});

	it('reads each field per item, so an expression can differ by item', () => {
		const ctx = odataMode({ odataFilterExpression: (i: number) => `RecId eq 'R${i}'` });
		assert.deepEqual(buildODataQuery.call(ctx, 2), { $filter: "RecId eq 'R2'" });
	});

	it('accepts a value that is not text, such as a number from an expression', () => {
		assert.deepEqual(buildODataQuery.call(odataMode({ odataSelect: 42 }), 0), { $select: '42' });
	});

	it('has no Search field, which Ivanti does not support for Get Many and the trigger', () => {
		assert.equal(odataListProperties.some((p) => p.name === 'odataSearch'), false);
		assert.deepEqual(buildODataQuery.call(odataMode({ odataSearch: 'printer' }), 0), {});
	});

	it('works in the polling trigger', () => {
		const { ctx } = fakePollContext({
			typeVersion: 1.3,
			parameters: { queryMode: 'odata', odataFilterExpression: "Status eq 'Active'" },
		});
		assert.deepEqual(buildODataQuery.call(ctx, 0), { $filter: "Status eq 'Active'" });
	});

	it('keeps the Advanced (JSON) query working', () => {
		const ctx = fakeExecuteContext({
			typeVersion: 1.3,
			parameters: { queryMode: 'json', odataQuery: '{"$filter":"Status eq \'Active\'","$orderby":"Subject"}' },
		}).ctx;
		assert.deepEqual(buildODataQuery.call(ctx, 0), { $filter: "Status eq 'Active'", $orderby: 'Subject' });
	});

	it('is not read on version 1.2, which has no OData mode', () => {
		const ctx = odataMode({ odataFilterExpression: "Status eq 'Active'" }, 1.2);
		assert.deepEqual(buildODataQuery.call(ctx, 0), {});
	});
});

describe('OData mode in the editor', () => {
	const named = (name: string) => odataListProperties.filter((p) => p.name === name);
	const shown = (property: INodeProperties, typeVersion: number, values: INodeParameters) =>
		NodeHelpers.displayParameter(values, property, { typeVersion }, null);
	const modeOptions = (typeVersion: number) =>
		named('queryMode')
			.filter((p) => shown(p, typeVersion, {}))
			.flatMap((p) => (p.options ?? []).map((o) => ('value' in o ? o.value : undefined)));

	it('offers Manual and JSON on 1.1 and 1.2, and adds OData on 1.3', () => {
		assert.deepEqual(modeOptions(1), []);
		assert.deepEqual(modeOptions(1.1), ['manual', 'json']);
		assert.deepEqual(modeOptions(1.2), ['manual', 'json']);
		assert.deepEqual(modeOptions(1.3), ['manual', 'odata', 'json']);
	});

	it('shows the OData fields only in OData mode, and the Manual fields only in Manual mode', () => {
		const [filter] = named('odataFilterExpression');
		const [orderDirection] = named('orderDirection');
		assert.equal(shown(filter, 1.3, { queryMode: 'odata' }), true);
		assert.equal(shown(filter, 1.3, { queryMode: 'manual' }), false);
		assert.equal(shown(orderDirection, 1.3, { queryMode: 'odata' }), false);
		assert.equal(shown(orderDirection, 1.3, { queryMode: 'manual' }), true);
	});

	it('warns about Return All only when the Filter is empty', () => {
		const [notice] = named('returnAllWithoutFilterNotice');
		const values = { queryMode: 'odata', returnAll: true, odataFilterExpression: '' };
		assert.equal(shown(notice, 1.3, values), true);
		assert.equal(shown(notice, 1.3, { ...values, odataFilterExpression: "Status eq 'Active'" }), false);
		assert.equal(shown(notice, 1.3, { ...values, returnAll: false }), false);
		assert.equal(shown(notice, 1.2, values), false);
		// n8n shows a parameter whose condition depends on an expression, so the
		// notice is worded to stay true then: "with an empty Filter".
		assert.equal(shown(notice, 1.3, { ...values, odataFilterExpression: '={{ $json.filter }}' }), true);
	});

	it('is version 1.3 of both nodes', () => {
		assert.deepEqual(new IvantiNeuronsForItsm().description.version, [1, 1.1, 1.2, 1.3]);
		assert.deepEqual(new IvantiNeuronsForItsmTrigger().description.version, [1, 1.1, 1.2, 1.3]);
	});
});
