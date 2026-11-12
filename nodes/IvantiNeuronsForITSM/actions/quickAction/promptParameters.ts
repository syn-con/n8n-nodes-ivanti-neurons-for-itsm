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

/** The complete REST prompt array, kept as written (hidden and sub-action entries included). */
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

/** Reads one item's prompt array; the empty default leaves the existing request unchanged. */
export function getPromptParameters(this: IExecuteFunctions, itemIndex: number): IDataObject[] {
	return parsePromptParameters.call(this, this.getNodeParameter('promptParams', itemIndex, '[]'), itemIndex);
}
