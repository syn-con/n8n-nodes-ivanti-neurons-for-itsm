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

/** Preserve the complete REST prompt metadata, including hidden/sub-action entries. */
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

/** Read one item's responses; the empty default leaves the existing request unchanged. */
export function getPromptParameters(
	this: IExecuteFunctions,
	itemIndex: number,
): IDataObject[] {
	const prompts = parsePromptParameters.call(this, this.getNodeParameter('promptParams', itemIndex, '[]'), itemIndex);
	const rows: unknown = this.getNodeParameter('promptResponses.responses', itemIndex, []);
	if (!Array.isArray(rows)) return fail.call(this, 'Prompt Responses must contain a list of responses', itemIndex);
	if (rows.length === 0) return prompts;
	if (prompts.length === 0) {
		return fail.call(this, 'Prompt Responses require a Prompt Parameters JSON template containing the action metadata and all hidden entries', itemIndex);
	}

	const seen = new Set<string>();
	const result = [...prompts];
	for (const [index, row] of Array.from(rows).entries()) {
		const label = `Prompt response ${index + 1}`;
		if (!isObject(row) || typeof row.fieldName !== 'string' || row.fieldName.trim() === '') {
			return fail.call(this, `${label} must have a non-empty Field Name`, itemIndex);
		}
		const fieldName = row.fieldName.trim();
		if (seen.has(fieldName.toLowerCase())) {
			return fail.call(this, `${label} repeats a Field Name; supply each response once`, itemIndex);
		}
		seen.add(fieldName.toLowerCase());
		if (!Object.prototype.hasOwnProperty.call(row, 'value') || !isJsonValue(row.value)) {
			return fail.call(this, `${label} must have a JSON-compatible Value (null is allowed)`, itemIndex);
		}
		const matches = prompts.flatMap((prompt, promptIndex) => prompt.FieldName === fieldName ? [promptIndex] : []);
		if (matches.length === 0) {
			return fail.call(this, `${label} has no matching FieldName in Prompt Parameters; field names are case-sensitive`, itemIndex);
		}
		if (matches.length > 1) {
			return fail.call(this, `${label} matches multiple prompt entries; set their Value directly in JSON to preserve sub-action identity`, itemIndex);
		}
		// Only Value changes; preserve identity, hidden values, and unknown metadata.
		result[matches[0]] = { ...prompts[matches[0]], Value: row.value } as IDataObject;
	}
	return result;
}
