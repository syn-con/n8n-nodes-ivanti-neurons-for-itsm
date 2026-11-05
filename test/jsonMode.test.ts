/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeHelpers, NodeOperationError, type INodeParameters, type INodeProperties } from 'n8n-workflow';

import { IvantiNeuronsForItsm } from '../nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node';
import { IvantiNeuronsForItsmTrigger } from '../nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node';
import { buildODataQuery } from '../nodes/IvantiNeuronsForITSM/odata/queryBuilder';
import { odataListProperties } from '../nodes/IvantiNeuronsForITSM/odata/queryProperties';
import { fakeExecuteContext, fakePollContext } from './context';

describe('Query mode in the editor', () => {
	const named = (name: string) => odataListProperties.filter((p) => p.name === name);
	const shown = (property: INodeProperties, typeVersion: number, values: INodeParameters) =>
		NodeHelpers.displayParameter(values, property, { typeVersion }, null);
	const modeOptions = (typeVersion: number) =>
		named('queryMode')
			.filter((p) => shown(p, typeVersion, {}))
			.flatMap((p) => (p.options ?? []).map((o) => ('value' in o ? o.value : undefined)));

	it('offers Manual and JSON from version 1.1 on, and no Mode on version 1', () => {
		assert.deepEqual(modeOptions(1), []);
		for (const typeVersion of [1.1, 1.2, 1.3]) {
			assert.deepEqual(modeOptions(typeVersion), ['manual', 'json'], `version ${typeVersion}`);
		}
	});

	it('shows one JSON field per version, described for 1.3 on version 1.3', () => {
		const jsonFields = (typeVersion: number) =>
			named('odataQuery').filter((p) => shown(p, typeVersion, { queryMode: 'json' }));
		for (const typeVersion of [1.1, 1.2, 1.3]) {
			assert.equal(jsonFields(typeVersion).length, 1, `version ${typeVersion}`);
		}
		assert.equal(jsonFields(1.2)[0].hint, undefined);
		assert.match(String(jsonFields(1.3)[0].description), /may also be lists/);
		assert.match(String(jsonFields(1.3)[0].hint), /Expression/);
		// The default stays the same, so saved nodes left at the default keep their query.
		assert.equal(jsonFields(1.3)[0].default, jsonFields(1.2)[0].default);
	});

	it('shows the Manual fields only in Manual mode', () => {
		const [orderDirection] = named('orderDirection');
		assert.equal(shown(orderDirection, 1.3, { queryMode: 'manual' }), true);
		assert.equal(shown(orderDirection, 1.3, { queryMode: 'json' }), false);
	});

	it('has no OData mode fields', () => {
		for (const name of ['odataFilterExpression', 'odataSelect', 'odataOrderBy', 'returnAllWithoutFilterNotice']) {
			assert.deepEqual(named(name), [], name);
		}
	});

	it('is version 1.3 of both nodes', () => {
		assert.deepEqual(new IvantiNeuronsForItsm().description.version, [1, 1.1, 1.2, 1.3]);
		assert.deepEqual(new IvantiNeuronsForItsmTrigger().description.version, [1, 1.1, 1.2, 1.3]);
	});
});

describe('JSON mode (version 1.3)', () => {
	const jsonQuery = (odataQuery: unknown, typeVersion = 1.3) =>
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

	it('sends $filter, $select and $orderby as written', () => {
		assert.deepEqual(jsonQuery('{"$filter":"Status eq \'Active\'","$select":"RecId","$orderby":"RecId desc"}'), {
			$filter: "Status eq 'Active'",
			$select: 'RecId',
			$orderby: 'RecId desc',
		});
	});

	it('accepts the keys without the $ sign and in any letter case', () => {
		assert.deepEqual(jsonQuery('{"filter":"Status eq \'Active\'","Select":"RecId","$OrderBy":"RecId desc"}'), {
			$filter: "Status eq 'Active'",
			$select: 'RecId',
			$orderby: 'RecId desc',
		});
	});

	it('joins a list for $select and $orderby with commas, dropping empty entries', () => {
		assert.deepEqual(
			jsonQuery({
				$filter: "Status eq 'Active'",
				select: ['RecId', ' Subject ', '', null],
				$orderby: ['LastModDateTime asc', 'RecId asc'],
			}),
			{ $filter: "Status eq 'Active'", $select: 'RecId,Subject', $orderby: 'LastModDateTime asc,RecId asc' },
		);
	});

	it('leaves out an empty list', () => {
		assert.deepEqual(jsonQuery({ $filter: 'x', $select: [] }), { $filter: 'x' });
	});

	it('refuses a list for $filter', () => {
		assert.throws(() => jsonQuery({ $filter: ['a', 'b'] }), refused('The OData query option "$filter" must be text', /\$select and \$orderby/));
	});

	it('refuses an object inside a list', () => {
		assert.throws(() => jsonQuery({ $select: [{ name: 'RecId' }] }), /must contain text only/);
	});

	it('refuses two keys for the same option', () => {
		assert.throws(
			() => jsonQuery('{"filter":"a","$filter":"b"}'),
			refused('"filter" and "$filter" both set $filter', /Keep only one/),
		);
	});

	it('refuses a misspelt key', () => {
		assert.throws(
			() => jsonQuery('{"$filter":"Status eq \'Active\'","$filtr":"x"}'),
			refused('Unknown OData option: $filtr', /^Use \$filter, \$select, \$orderby \(with or without the \$ sign\)\./),
		);
	});

	it('refuses an unknown key even when its value is null', () => {
		assert.throws(() => jsonQuery('{"$filter":"x","$count":null}'), /Unknown OData option: \$count/);
	});

	it('refuses $search, with or without the $ sign, and points to Search by Keyword', () => {
		assert.throws(() => jsonQuery('{"$search":"printer"}'), refused('"$search" cannot be used here', /Search by Keyword/));
		assert.throws(() => jsonQuery('{"search":"printer"}'), refused('"search" cannot be used here', /Search by Keyword/));
	});

	it('refuses the paging options, with or without the $ sign', () => {
		assert.throws(() => jsonQuery('{"$top":5}'), refused('"$top" cannot be set in the OData query', /Return All and Limit/));
		assert.throws(() => jsonQuery('{"Skip":5}'), refused('"Skip" cannot be set in the OData query', /Return All and Limit/));
	});

	it('refuses a query that sets nothing', () => {
		assert.throws(() => jsonQuery('{"$filter":null,"$select":[]}'), /The OData Query is empty/);
	});

	it('works the same in the polling trigger', () => {
		const { ctx } = fakePollContext({
			typeVersion: 1.3,
			parameters: { queryMode: 'json', odataQuery: '{"filter":"x","orderby":["LastModDateTime asc","RecId asc"]}' },
		});
		assert.deepEqual(buildODataQuery.call(ctx, 0), { $filter: 'x', $orderby: 'LastModDateTime asc,RecId asc' });
	});
});

describe('JSON mode on versions 1.1 and 1.2', () => {
	const jsonQuery = (odataQuery: unknown, typeVersion: number) =>
		buildODataQuery.call(
			fakeExecuteContext({ typeVersion, parameters: { queryMode: 'json', odataQuery } }).ctx,
			0,
		);

	it('still passes any key as written', () => {
		for (const typeVersion of [1.1, 1.2]) {
			assert.deepEqual(jsonQuery('{"filter":"x","$count":true}', typeVersion), { filter: 'x', $count: true });
		}
	});

	it('still refuses a list', () => {
		assert.throws(() => jsonQuery({ $select: ['RecId'] }, 1.2), /must be text, a number or true\/false/);
	});
});
