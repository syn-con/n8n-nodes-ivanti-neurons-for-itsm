import { IDataObject, NodeOperationError } from "n8n-workflow"
import type { IExecuteFunctions, INodeProperties, IPollFunctions, ITriggerFunctions } from 'n8n-workflow';

/**
 * Reusable Resource Locator property definition for selecting a Service Request Template.
 * Supports both list-based selection (via `getServiceReqTemplates` loadOptions method)
 * and manual entry of a template RecId.
 */
export const serviceReqTemplateRLC: INodeProperties = {
	displayName: 'Service Request Template',
	name: 'serviceReqTemplateId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'Select the service request template to use',
	modes: [
		{
			displayName: 'Select Service Request Template',
			name: 'list',
			type: 'list',
			placeholder: 'e.g. Default',
			typeOptions: {
				searchListMethod: 'getServiceReqTemplates',
			},
		},
		{
			displayName: 'Enter Service Request Template ID',
			name: 'manual',
			type: 'string',
			placeholder: 'e.g. 1234567890',
		},
	]
}

/**
 * Shape of the OData response returned by Ivanti list endpoints.
 * `@odata.count` is the total number of records matching the query (before paging).
 * `value` contains the current page of records.
 */
export interface SearchResponse {
	"@odata.context": string
	"@odata.count": number,
	value: IDataObject[]
}

/**
 * Encodes a username/password pair as a Base64 Basic-Auth string.
 * The result is suitable for use in an `Authorization: Basic <token>` header.
 *
 * @param username - Plain-text username
 * @param password - Plain-text password
 * @returns Base64-encoded `username:password` string
 */
export function encodeBasicAuth(username: string, password: string): string {
	return Buffer.from(`${username}:${password}`).toString('base64');
}

/**
 * Asserts that a field name is safe for use in an OData query.
 * @param name - The field name to check
 * @throws {NodeOperationError} if the field name is not safe
 */

export function assertSafeFieldName(this: IExecuteFunctions | IPollFunctions, name: string) {
	if (!/^[A-Za-z0-9_]+$/.test(name)) {
		throw new NodeOperationError(this.getNode(), `Invalid field name: "${name}"`);
	}
}

/**
 * Escapes a string value for safe inclusion in an OData string literal.
 * Per the OData spec, a single quote inside a string literal must be doubled.
 * Returns the value already wrapped in single quotes, ready to drop into a
 * `$filter` expression.
 *
 * @param value - Raw string value from user input
 * @returns The value as a quoted, escaped OData string literal, e.g. `'O''Brien'`
 */
export function escapeODataString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}
/**
 * Asserts that a value is a valid Ivanti record GUID.
 * Ivanti GUIDs are documented as 32 hex characters, e.g.
 * '07E1BD1BF5804E67B8E76B26FA6EF9A0'. Hyphenated 36-char GUIDs are also accepted.
 * @throws {NodeOperationError} if the value is not a valid GUID
 */
export function assertSafeRecordId(this: IExecuteFunctions | IPollFunctions, id: string) {
	if (!/^[0-9A-Fa-f]{32}$/.test(id) && !/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(id)) {
		throw new NodeOperationError(this.getNode(), `Invalid record ID (expected a 32-character GUID): "${id}"`);
	}
}

/**
 * Asserts that an OData path segment (business object collection name,
 * relationship name, quick action name, saved-search name) is safe to
 * interpolate into a URL path. Allows only letters, digits and underscores.
 * @throws {NodeOperationError} if the segment is not safe
 */
export function assertSafePathSegment(this: IExecuteFunctions | IPollFunctions, segment: string, label: string) {
	if (!/^[A-Za-z0-9_]+$/.test(segment)) {
		throw new NodeOperationError(this.getNode(), `Invalid ${label}: "${segment}"`);
	}
}
/**
 * Parses a filter value into a strict boolean for OData filters.
 *
 * Accepts a real boolean (e.g. when the value comes from an n8n expression that
 * resolves to `true`/`false`) as well as the literal strings "true" and "false"
 * (case-insensitive, trimmed). Everything else throws so the user gets an
 * explicit error instead of a silently inverted filter.
 *
 * @param value - The raw value from the OData filter UI or an expression
 * @throws {NodeOperationError} if the value is not a boolean or "true"/"false"
 */
export function parseBoolean(
	this: IExecuteFunctions | ITriggerFunctions | IPollFunctions,
	value: unknown,
): boolean {
	if (typeof value === 'boolean') {
		return value;
	}
	const normalized = String(value).trim().toLowerCase();
	if (normalized === 'true') {
		return true;
	}
	if (normalized === 'false') {
		return false;
	}
	throw new NodeOperationError(
		this.getNode(),
		`Invalid boolean: "${String(value)}" (expected true or false)`,
	);
}
// nodes/IvantiNeuronsForITSM/common.ts
/**
 * Converts a plural Ivanti business object name (e.g. "Tasks") into the
 * singular "#"-suffixed object type expected by quick-action / attachment
 * payloads (e.g. "Task#"). Only the trailing plural "s" is replaced.
 */
export function toActualObjectType(pluralName: string): string {
	return pluralName.replace(/s$/, '#');
}

/**
 * Validates that a business-object name is present and plural (Ivanti OData
 * collections are always plural, e.g. "Incidents", "Changes"). Trims surrounding
 * whitespace and returns the cleaned value so callers can use it directly.
 *
 * @param value - Raw business-object parameter value
 * @param label - Display name used in error messages (default "Business Object")
 * @returns The trimmed, validated business-object name
 * @throws {NodeOperationError} if the value is empty or does not end with "s"
 */
export function validateBusinessObject(
	this: IExecuteFunctions | IPollFunctions,
	value: string,
	label = 'Business Object',
): string {
	const object = (value ?? '').trim();
	if (object === '') {
		throw new NodeOperationError(this.getNode(), `The "${label}" parameter is required`);
	}
	if (!object.endsWith('s')) {
		throw new NodeOperationError(
			this.getNode(),
			`The "${label}" must end with an "s" because Ivanti OData collections are plural (e.g. "Incidents", "Changes")`,
		);
	}
	return object;
}