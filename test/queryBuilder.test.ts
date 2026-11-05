/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	buildODataQuery,
	parseNativeODataQuery,
	parseValue,
} from '../nodes/IvantiNeuronsForITSM/odata/queryBuilder';
import { fakeExecuteContext, fakePollContext } from './context';

const filter = (fieldName: string, fieldType: string, operation: string, value: string, logicalOperator = 'and') => ({
	fieldName,
	fieldType,
	operation,
	value,
	logicalOperator,
});

describe('buildODataQuery, Manual mode', () => {
	it('builds $select, $filter and $orderby from the UI rows', () => {
		const { ctx } = fakeExecuteContext({
			parameters: {
				selectAllFields: false,
				'selectFields.fields': [{ name: ' Subject ' }, { name: '' }, { name: 'Status' }],
				'odataFilter.odataFilter': [
					filter('Subject', 'string', 'eq', "O'Brien"),
					filter('Priority', 'number', 'le', '2', 'or'),
					filter('Owner', 'string', 'isnull', ''),
					filter('Team', 'string', 'isnotnull', ''),
				],
				orderBy: 'CreatedDateTime',
				orderDirection: 'DESC',
			},
		});

		assert.deepEqual(buildODataQuery.call(ctx, 0, { includeRecId: true }), {
			$select: 'RecId,Subject,Status',
			$filter: "Subject eq 'O''Brien' or Priority le 2 and Owner eq null and Team ne null",
			$orderby: 'CreatedDateTime desc',
		});
	});

	it('selects all fields and sends nothing when no option is set', () => {
		const { ctx } = fakeExecuteContext();
		assert.deepEqual(buildODataQuery.call(ctx, 0), {});
	});

	it('refuses a filter field name that would change the filter', () => {
		const { ctx } = fakeExecuteContext({
			parameters: { 'odataFilter.odataFilter': [filter("Status eq 'x' or RecId", 'string', 'ne', 'y')] },
		});
		assert.throws(() => buildODataQuery.call(ctx, 0), /Invalid field name/);
	});

	it('refuses an unsafe Select Fields name', () => {
		const { ctx } = fakeExecuteContext({
			parameters: { selectAllFields: false, 'selectFields.fields': [{ name: 'Subject,Status' }] },
		});
		assert.throws(() => buildODataQuery.call(ctx, 0), /Invalid field name/);
	});

	it('refuses an order direction other than asc or desc', () => {
		const { ctx } = fakeExecuteContext({ parameters: { orderBy: 'IncidentNumber', orderDirection: 'ascending' } });
		assert.throws(() => buildODataQuery.call(ctx, 0), /Invalid order direction: "ascending"/);
	});

	it('reads parameters per item', () => {
		const { ctx } = fakeExecuteContext({
			parameters: { 'odataFilter.odataFilter': (i: number) => [filter('Status', 'string', 'eq', `S${i}`)] },
		});
		assert.equal(buildODataQuery.call(ctx, 1).$filter, "Status eq 'S1'");
	});

	it('reads parameters in a polling trigger, where the second argument is the fallback', () => {
		const { ctx } = fakePollContext({
			parameters: { 'odataFilter.odataFilter': [filter('Status', 'string', 'eq', 'Active')] },
		});
		assert.deepEqual(buildODataQuery.call(ctx, 0), { $filter: "Status eq 'Active'" });
	});
});

describe('buildODataQuery, version 1 raw filter', () => {
	it('builds the filter from the JSON conditions', () => {
		const { ctx } = fakeExecuteContext({
			typeVersion: 1,
			parameters: {
				useRawFilter: true,
				rawFilter: '[{"fieldName":"Status","value":"Active"},{"fieldName":"Priority","fieldType":"number","operation":"gt","value":1,"logicalOperator":"or"}]',
			},
		});
		assert.deepEqual(buildODataQuery.call(ctx, 0), { $filter: "Status eq 'Active' or Priority gt 1" });
	});

	it('refuses an operation the filter builder does not offer', () => {
		const { ctx } = fakeExecuteContext({
			typeVersion: 1,
			parameters: { useRawFilter: true, rawFilter: '{"fieldName":"Subject","operation":"contains","value":"x"}' },
		});
		assert.throws(() => buildODataQuery.call(ctx, 0), /unsupported "operation": contains/);
	});

	it('ignores JSON mode, which version 1 does not have', () => {
		const { ctx } = fakeExecuteContext({
			typeVersion: 1,
			parameters: { queryMode: 'json', odataQuery: '{"$filter":"x"}' },
		});
		assert.deepEqual(buildODataQuery.call(ctx, 0), {});
	});
});

describe('buildODataQuery, JSON mode', () => {
	const jsonMode = (odataQuery: unknown) =>
		fakeExecuteContext({ typeVersion: 1.1, parameters: { queryMode: 'json', odataQuery } }).ctx;

	it('passes the query to Ivanti unchanged', () => {
		const query = { $filter: "Status eq 'Active'", $select: 'RecId,Subject', $count: true };
		assert.deepEqual(buildODataQuery.call(jsonMode(JSON.stringify(query)), 0), query);
	});

	it('accepts an object from an expression', () => {
		assert.deepEqual(buildODataQuery.call(jsonMode({ $orderby: 'Subject' }), 0), { $orderby: 'Subject' });
	});

	for (const key of ['$top', '$skip', '$Skip']) {
		it(`refuses ${key}, which paging controls`, () => {
			assert.throws(
				() => buildODataQuery.call(jsonMode(`{"${key}": 5}`), 0),
				new RegExp(`"\\${key}" cannot be set`),
			);
		});
	}

	it('refuses a nested value', () => {
		assert.throws(
			() => buildODataQuery.call(jsonMode('{"$filter":{"Status":"Active"}}'), 0),
			/must be text, a number or true\/false/,
		);
	});

	for (const [label, value] of [
		['empty text', ''],
		['an empty object', '{}'],
		['only null values', '{"$filter":null}'],
		['an unresolved expression', undefined],
	] as const) {
		it(`refuses ${label}`, () => {
			assert.throws(() => parseNativeODataQuery.call(jsonMode(value), value, 0), /The OData Query is empty/);
		});
	}
});

describe('parseValue', () => {
	const { ctx } = fakeExecuteContext();

	it('quotes and escapes strings', () => {
		assert.equal(parseValue.call(ctx, 'string', "it's"), "'it''s'");
		assert.equal(parseValue.call(ctx, 'string', 42), "'42'");
	});

	it('parses numbers and refuses empty or non-numeric text', () => {
		assert.equal(parseValue.call(ctx, 'number', ' 7 '), 7);
		assert.equal(parseValue.call(ctx, 'number', 0), 0);
		assert.throws(() => parseValue.call(ctx, 'number', ''), /A numeric value is required/);
		assert.throws(() => parseValue.call(ctx, 'number', 'seven'), /Invalid number: seven/);
	});

	it('parses booleans', () => {
		assert.equal(parseValue.call(ctx, 'boolean', 'TRUE'), true);
		assert.equal(parseValue.call(ctx, 'boolean', false), false);
	});

	it('returns dates as ISO 8601 and refuses invalid ones', () => {
		assert.equal(parseValue.call(ctx, 'date', '2026-11-05T10:00:00Z'), '2026-11-05T10:00:00.000Z');
		assert.equal(parseValue.call(ctx, 'date', new Date(Date.UTC(2026, 0, 2))), '2026-01-02T00:00:00.000Z');
		assert.throws(() => parseValue.call(ctx, 'date', 'yesterday'), /Invalid date/);
	});

	it('refuses a missing value', () => {
		assert.throws(() => parseValue.call(ctx, 'string', undefined), /A value is required/);
	});
});
