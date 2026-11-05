/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coerceParameterValue } from '../nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation';

describe('coerceParameterValue', () => {
	it('sends numbers, booleans and objects as text', () => {
		assert.equal(coerceParameterValue(3, 'text'), '3');
		assert.equal(coerceParameterValue(true, 'checkbox'), 'true');
		assert.equal(coerceParameterValue({ a: 1 }, 'text'), '{"a":1}');
	});

	it('passes a missing value on unchanged, so the parameter is left out', () => {
		assert.equal(coerceParameterValue(undefined, 'text'), undefined);
		assert.equal(coerceParameterValue(null, 'text'), null);
	});

	it('drops milliseconds from a date-time and ends it with Z', () => {
		assert.equal(coerceParameterValue('2026-11-05T10:20:30.123Z', 'datetime'), '2026-11-05T10:20:30Z');
		assert.equal(coerceParameterValue('2026-11-05T10:20:30', 'datetime'), '2026-11-05T10:20:30Z');
		assert.equal(
			coerceParameterValue(new Date(Date.UTC(2026, 10, 5, 10, 20, 30, 456)), 'datetime'),
			'2026-11-05T10:20:30Z',
		);
	});

	it('keeps only the day of a date', () => {
		assert.equal(coerceParameterValue('2026-11-05T13:45:00Z', 'date'), '2026-11-05T00:00:00Z');
		assert.equal(coerceParameterValue('2026-11-05', 'date'), '2026-11-05T00:00:00Z');
	});

	it('leaves blank text alone', () => {
		assert.equal(coerceParameterValue('  ', 'datetime'), '  ');
	});
});
