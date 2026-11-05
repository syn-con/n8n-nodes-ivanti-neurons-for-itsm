/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeHelpers, NodeOperationError, type INodeParameters, type INodeProperties } from 'n8n-workflow';

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

describe('Advanced (JSON) mode keys (version 1.3)', () => {
	const jsonQuery = (odataQuery: string, typeVersion = 1.3) =>
		buildODataQuery.call(
			fakeExecuteContext({ typeVersion, parameters: { queryMode: 'json', odataQuery } }).ctx,
			0,
		);
	/** Asserts the error message and its description. */
	const refused = (message: string, description: RegExp) => (error: unknown) => {
		assert.ok(error instanceof NodeOperationError);
		assert.equal(error.message, message);
		assert.match(String(error.description), description);
		return true;
	};

	it('sends $filter, $select and $orderby as today', () => {
		assert.deepEqual(jsonQuery('{"$filter":"Status eq \'Active\'","$select":"RecId","$orderby":"RecId desc"}'), {
			$filter: "Status eq 'Active'",
			$select: 'RecId',
			$orderby: 'RecId desc',
		});
	});

	it('refuses a key without the dollar sign, and suggests the option', () => {
		assert.throws(
			() => jsonQuery('{"filter":"Status eq \'Active\'"}'),
			refused('Unknown OData option: filter', /Did you mean "\$filter"\?/),
		);
	});

	it('refuses a key in the wrong case', () => {
		assert.throws(() => jsonQuery('{"$OrderBy":"RecId"}'), refused('Unknown OData option: $OrderBy', /Did you mean "\$orderby"\?/));
	});

	it('refuses a misspelt key without a suggestion', () => {
		assert.throws(
			() => jsonQuery('{"$filter":"Status eq \'Active\'","$filtr":"x"}'),
			refused('Unknown OData option: $filtr', /^Use \$filter, \$select, \$orderby\./),
		);
	});

	it('refuses $search and points to Search by Keyword', () => {
		assert.throws(() => jsonQuery('{"$search":"printer"}'), refused('"$search" cannot be used here', /Search by Keyword/));
	});

	it('refuses an unknown key even when its value is null', () => {
		assert.throws(() => jsonQuery('{"$filter":"x","$count":null}'), /Unknown OData option: \$count/);
	});

	it('keeps the paging message for $top', () => {
		assert.throws(() => jsonQuery('{"$top":5}'), /"\$top" cannot be set/);
	});

	it('still passes any key on versions 1.1 and 1.2', () => {
		for (const typeVersion of [1.1, 1.2]) {
			assert.deepEqual(jsonQuery('{"filter":"x","$count":true}', typeVersion), { filter: 'x', $count: true });
		}
	});
});
