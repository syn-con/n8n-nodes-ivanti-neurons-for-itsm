import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { jsonParse, NodeOperationError } from 'n8n-workflow';

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]';
}

/** Reject values JSON would silently drop, coerce, or fail to serialize. */
function isJsonValue(value: unknown, ancestors = new Set<unknown>()): boolean {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if ((!Array.isArray(value) && !isObject(value)) || ancestors.has(value)) return false;
	ancestors.add(value);
	const values = Array.isArray(value) ? Array.from(value) : Object.values(value);
	const valid = values.every((entry) => isJsonValue(entry, ancestors));
	ancestors.delete(value);
	return valid;
}

function fail(this: IExecuteFunctions, message: string, itemIndex: number): never {
	throw new NodeOperationError(this.getNode(), message, { itemIndex });
}

/** JSON mode: the complete REST prompt array, kept as written (hidden and sub-action entries included). */
function parsePromptParameters(this: IExecuteFunctions, raw: unknown, itemIndex: number): IDataObject[] {
	if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return [];
	let parsed: unknown = raw;
	if (typeof raw === 'string') {
		try {
			parsed = jsonParse(raw);
		} catch {
			fail.call(this, 'Prompt Parameters must contain valid JSON', itemIndex);
		}
	}
	if (!Array.isArray(parsed)) {
		return fail.call(this, 'Prompt Parameters must be a JSON array', itemIndex);
	}
	return Array.from(parsed, (entry: unknown, index) => {
		const label = `Prompt Parameters entry ${index + 1}`;
		if (!isObject(entry)) return fail.call(this, `${label} must be a JSON object`, itemIndex);
		if (typeof entry.FieldName !== 'string' || entry.FieldName.trim() === '') {
			return fail.call(this, `${label} must have a non-empty FieldName`, itemIndex);
		}
		if (!Object.prototype.hasOwnProperty.call(entry, 'Value')) {
			return fail.call(this, `${label} must have a Value (null is allowed)`, itemIndex);
		}
		if (!isJsonValue(entry)) {
			return fail.call(this, `${label} must contain only JSON values; undefined, non-finite numbers, and circular values are not supported`, itemIndex);
		}
		return entry as IDataObject;
	});
}

/** The record the prompts answer for, used to build the Manual mode entries. */
export interface PromptTarget {
	/** RecId of the record the quick action runs on */
	recordId: string;
	/** Ivanti object type of that record, e.g. `Incident#` */
	objectType: string;
}

/**
 * Manual mode: builds one `DataLayer.PromptData` entry per Field Name / Value row,
 * pointing at the record the action runs on. No rows means no prompts.
 */
function buildManualPrompts(this: IExecuteFunctions, itemIndex: number, target: PromptTarget): IDataObject[] {
	const rows: unknown = this.getNodeParameter('manualPrompts.prompt', itemIndex, []);
	if (!Array.isArray(rows)) return fail.call(this, 'Prompts must contain a list of prompts', itemIndex);

	const seen = new Set<string>();
	return Array.from(rows, (row: unknown, index) => {
		const label = `Prompt ${index + 1}`;
		if (!isObject(row) || typeof row.fieldName !== 'string' || row.fieldName.trim() === '') {
			return fail.call(this, `${label} must have a non-empty Field Name`, itemIndex);
		}
		const fieldName = row.fieldName.trim();
		if (seen.has(fieldName.toLowerCase())) {
			return fail.call(this, `${label} repeats a Field Name; supply each prompt once`, itemIndex);
		}
		seen.add(fieldName.toLowerCase());
		const value = Object.prototype.hasOwnProperty.call(row, 'value') ? row.value : '';
		if (!isJsonValue(value)) {
			return fail.call(this, `${label} must have a JSON-compatible Value (null is allowed)`, itemIndex);
		}
		return {
			__type: 'DataLayer.PromptData',
			ActionId: null,
			ActionObjectId: null,
			PromptObjectId: target.recordId,
			ActionObjectType: target.objectType,
			PromptObjectType: target.objectType,
			Value: value,
			FieldName: fieldName,
			IsNewPrompt: true,
		} as IDataObject;
	});
}

/**
 * Reads one item's prompts in the selected mode. Manual builds the entries from
 * the rows; JSON takes the complete array as written. The empty defaults leave
 * the existing request unchanged.
 */
export function getPromptParameters(
	this: IExecuteFunctions,
	itemIndex: number,
	target: PromptTarget,
): IDataObject[] {
	const mode = this.getNodeParameter('promptMode', itemIndex, 'manual') as string;
	if (mode === 'manual') return buildManualPrompts.call(this, itemIndex, target);
	if (mode !== 'json') return fail.call(this, `Unknown Prompt Mode: ${mode}`, itemIndex);
	return parsePromptParameters.call(this, this.getNodeParameter('promptParams', itemIndex, '[]'), itemIndex);
}
