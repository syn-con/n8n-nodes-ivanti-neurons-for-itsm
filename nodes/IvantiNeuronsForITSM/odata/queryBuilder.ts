import type { IDataObject, IExecuteFunctions, IPollFunctions } from 'n8n-workflow';
import { jsonParse, NodeOperationError } from 'n8n-workflow';
import { assertSafeFieldName, escapeODataString, parseBoolean, parseJsonObjectParameter, readSelectFieldNames } from '../common';


/** Context shared by execute (action) and poll (trigger) callers. */
type QueryCtx = IExecuteFunctions | IPollFunctions;

/** A single row from the OData Filter fixedCollection UI. */
export interface ODataFilterEntry {
    fieldName: string;
    fieldType: string;
    operation: string;
    value: string;
    logicalOperator: string;
}

/** Options that differ per caller. */
export interface BuildODataQueryOptions {
    /** Prepend RecId to $select when projecting specific fields (trigger needs this for dedup). */
    includeRecId?: boolean;
}

/**
 * Converts a raw filter value (from the UI or an n8n expression) into the
 * correct OData literal.
 *
 * - `string`  -> single-quoted, with embedded quotes escaped per the OData spec
 * - `number`  -> parsed as a JS number (rejects empty / non-numeric values)
 * - `boolean` -> coerced to a real boolean
 * - `date`    -> parsed and returned as an ISO 8601 string (accepts Date objects
 *               and numeric epoch values as well as date strings)
 * - anything else -> null
 *
 * The value may arrive as a non-string (number, boolean, Date, …) when it comes
 * from an expression, so each branch handles its own type rather than assuming
 * a string.
 *
 * @throws {NodeOperationError} when the value is missing or cannot be parsed
 */
export function parseValue(
    this: QueryCtx,
    fieldType: string,
    value: unknown,
): string | number | boolean | null {
    if (value === undefined || value === null) {
        throw new NodeOperationError(
            this.getNode(),
            `A value is required for a "${fieldType}" filter`,
        );
    }

    if (fieldType === 'string') {
        // escapeODataString returns the value already wrapped in single quotes,
        // doubling any embedded quotes so values like O'Brien don't break the
        // $filter (and to prevent OData injection).
        return escapeODataString(typeof value === 'string' ? value : String(value));
    }
    if (fieldType === 'number') {
        if (typeof value === 'number') {
            if (isNaN(value)) {
                throw new NodeOperationError(this.getNode(), 'Invalid number: NaN');
            }
            return value;
        }
        const raw = String(value).trim();
        // Number('') is 0, so guard empty input explicitly instead of silently
        // filtering on 0.
        if (raw === '') {
            throw new NodeOperationError(this.getNode(), 'A numeric value is required');
        }
        const num = Number(raw);
        if (isNaN(num)) {
            throw new NodeOperationError(this.getNode(), `Invalid number: ${raw}`);
        }
        return num;
    }
    if (fieldType === 'boolean') {
        return parseBoolean.call(this, value);
    }
    if (fieldType === 'date') {
        // Accept Date objects and numeric epoch values directly; otherwise parse
        // the string form (also handles ISO strings from expressions / luxon).
        const date =
            value instanceof Date
                ? value
                : typeof value === 'number'
                    ? new Date(value)
                    : new Date(String(value).trim());
        if (isNaN(date.getTime())) {
            throw new NodeOperationError(this.getNode(), `Invalid date: ${String(value)}`);
        }
        return date.toISOString();
    }
    return null;
}

const FILTER_OPERATIONS = ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'isnull', 'isnotnull'];
const FILTER_FIELD_TYPES = ['string', 'number', 'boolean', 'date'];
const LOGICAL_OPERATORS = ['and', 'or'];

/**
 * Parses the "Raw Filter (JSON)" parameter into filter entries.
 *
 * Accepts a JSON string or an already-parsed value (from an expression), either
 * an array of conditions or a single condition object. Because the operation,
 * field type and logical operator are interpolated into the `$filter` string,
 * each is checked against the same allow-list the filter builder UI offers.
 *
 * @throws {NodeOperationError} when the JSON is invalid or a condition is malformed
 */
export function parseRawFilter(this: QueryCtx, raw: unknown): ODataFilterEntry[] {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
        if (raw.trim() === '') return [];
        try {
            parsed = jsonParse(raw);
        } catch {
            throw new NodeOperationError(this.getNode(), 'Raw Filter (JSON) is not valid JSON');
        }
    }
    if (parsed === undefined || parsed === null) return [];

    const conditions = Array.isArray(parsed) ? parsed : [parsed];

    return conditions.map((condition, index) => {
        const position = `Raw Filter condition ${index + 1}`;
        if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
            throw new NodeOperationError(this.getNode(), `${position} must be an object`);
        }
        const entry = condition as IDataObject;

        const fieldName = entry.fieldName;
        if (typeof fieldName !== 'string' || fieldName.trim() === '') {
            throw new NodeOperationError(this.getNode(), `${position} requires a "fieldName"`);
        }

        const operation = String(entry.operation ?? 'eq').toLowerCase();
        if (!FILTER_OPERATIONS.includes(operation)) {
            throw new NodeOperationError(
                this.getNode(),
                `${position} has an unsupported "operation": ${operation}`,
                { description: `Supported operations: ${FILTER_OPERATIONS.join(', ')}` },
            );
        }

        const fieldType = String(entry.fieldType ?? 'string').toLowerCase();
        if (!FILTER_FIELD_TYPES.includes(fieldType)) {
            throw new NodeOperationError(
                this.getNode(),
                `${position} has an unsupported "fieldType": ${fieldType}`,
                { description: `Supported field types: ${FILTER_FIELD_TYPES.join(', ')}` },
            );
        }

        const logicalOperator = String(entry.logicalOperator ?? 'and').toLowerCase();
        if (!LOGICAL_OPERATORS.includes(logicalOperator)) {
            throw new NodeOperationError(
                this.getNode(),
                `${position} has an unsupported "logicalOperator": ${logicalOperator}`,
                { description: 'Supported logical operators: and, or' },
            );
        }

        return {
            fieldName: fieldName.trim(),
            fieldType,
            operation,
            value: entry.value as string,
            logicalOperator,
        };
    });
}

/** Query options owned by Return All / Limit paging. */
const PAGING_OPTIONS = ['$top', '$skip'];

/**
 * The query options Ivanti documents for reading a business object, accepted in
 * JSON mode from node version 1.3. Ivanti ignores any other key, so a typo such
 * as `filter` or `$filtr` would read the business object unfiltered.
 */
const ODATA_OPTIONS = ['$filter', '$select', '$orderby'];

/**
 * Refuses a JSON-mode key that is not an accepted query option (node version 1.3+).
 * Paging options are refused earlier, with their own message.
 */
function assertKnownODataOption(this: QueryCtx, key: string, itemIndex: number): void {
    if (ODATA_OPTIONS.includes(key)) return;

    if (key.toLowerCase() === '$search') {
        throw new NodeOperationError(this.getNode(), '"$search" cannot be used here', {
            itemIndex,
            description: 'Ivanti does not support $search for this read. To search by keyword, use Business Object → Search by Keyword.',
        });
    }

    // `filter`, `$Filter` or `$FILTER` for `$filter`
    const suggestion = ODATA_OPTIONS.find((option) => option === `$${key.replace(/^\$/, '').toLowerCase()}`);
    throw new NodeOperationError(this.getNode(), `Unknown OData option: ${key}`, {
        itemIndex,
        description: `${suggestion ? `Did you mean "${suggestion}"? ` : ''}Use ${ODATA_OPTIONS.join(', ')}. Ivanti ignores other keys, which would read every record.`,
    });
}

/**
 * Reads the "OData Query (JSON)" parameter (JSON mode, node version 1.1+).
 *
 * The query is passed to Ivanti exactly as written: no field validation, value
 * quoting or other transformation. Only the shape is checked: it must be a JSON
 * object of plain values, and must not set `$top` / `$skip`, which Return All
 * and Limit use for paging. From node version 1.3, each key must also be one of
 * `ODATA_OPTIONS`.
 *
 * @throws {NodeOperationError} when the JSON is invalid, a value is not a plain
 *   value, a paging option is set, or (version 1.3+) a key is not an OData option
 */
export function parseNativeODataQuery(
    this: QueryCtx,
    raw: unknown,
    itemIndex: number,
): IDataObject {
    // An expression on a missing property resolves to undefined, null or ''.
    // parseJsonObjectParameter treats that as "no options", which here would
    // silently read the business object unfiltered, so refuse it instead.
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        throw emptyQueryError.call(this, itemIndex);
    }
    const parsed = parseJsonObjectParameter.call(this, raw, 'The "OData Query (JSON)" field', itemIndex);
    // Versions 1.1 and 1.2 keep passing any key, so existing workflows run as before.
    const knownOptionsOnly = this.getNode().typeVersion >= 1.3;

    const query: IDataObject = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (PAGING_OPTIONS.includes(key.toLowerCase())) {
            throw new NodeOperationError(
                this.getNode(),
                `"${key}" cannot be set in the OData query`,
                { itemIndex, description: 'Paging is controlled by Return All and Limit' },
            );
        }
        if (knownOptionsOnly) assertKnownODataOption.call(this, key, itemIndex);
        if (value === undefined || value === null) continue;
        if (typeof value === 'object') {
            throw new NodeOperationError(
                this.getNode(),
                `The OData query option "${key}" must be text, a number or true/false`,
                { itemIndex },
            );
        }
        query[key] = value;
    }
    if (Object.keys(query).length === 0) {
        throw emptyQueryError.call(this, itemIndex);
    }
    return query;
}

function emptyQueryError(this: QueryCtx, itemIndex: number): NodeOperationError {
    return new NodeOperationError(this.getNode(), 'The OData Query is empty', {
        itemIndex,
        description:
            'Enter at least one query option, for example {"$filter": "Status eq \'Active\'"}. If the query comes from an expression, check that it resolves to a value for this item. To read records without a filter, switch Mode to Manual.',
    });
}

/**
 * OData mode (node version 1.3): each text field and the query option it fills.
 * There is no Search field: Ivanti does not support `$search` in the queries Get Many
 * and the polling trigger send (Search by Keyword uses it on its own).
 */
const ODATA_MODE_FIELDS: Array<[parameter: string, option: string]> = [
    ['odataFilterExpression', '$filter'],
    ['odataSelect', '$select'],
    ['odataOrderBy', '$orderby'],
];

/**
 * Builds the query in OData mode (node version 1.3): each non-empty field becomes
 * its query option, sent as written, like the JSON mode. Empty fields are left
 * out, so a node with only a Filter sends only `$filter`.
 */
function buildOptionsQuery(this: QueryCtx, itemIndex: number): IDataObject {
    const query: IDataObject = {};
    for (const [parameter, option] of ODATA_MODE_FIELDS) {
        const value = readParam.call(this, parameter, itemIndex, '');
        const text = value === undefined || value === null ? '' : String(value).trim();
        if (text !== '') query[option] = text;
    }
    return query;
}

/**
 * Reads a node parameter in either context. Execute functions take
 * `(name, itemIndex, fallback)`, but poll functions take `(name, fallback)`:
 * passing an item index there would make it the fallback.
 */
function readParam(this: QueryCtx, name: string, itemIndex: number, fallback: unknown): unknown {
    if ('getInputData' in this) {
        return (this as IExecuteFunctions).getNodeParameter(name, itemIndex, fallback);
    }
    return (this as IPollFunctions).getNodeParameter(name, fallback);
}

/**
 * Assembles an OData query object ($select, $filter, $orderby) from the node UI inputs.
 *
 * Parameters are read with `readParam`, so the same code works for
 * `IExecuteFunctions` (per item) and `IPollFunctions` (no items).
 *
 * Every filter field name is validated with `assertSafeFieldName`, so all callers
 * get OData-injection protection for free.
 */
export function buildODataQuery(
    this: QueryCtx,
    itemIndex: number,
    options: BuildODataQueryOptions = {},
): IDataObject {
    const nodeVersion = this.getNode().typeVersion;
    const queryMode = nodeVersion >= 1.1 ? readParam.call(this, 'queryMode', itemIndex, 'manual') : 'manual';
    if (queryMode === 'json') {
        return parseNativeODataQuery.call(
            this,
            readParam.call(this, 'odataQuery', itemIndex, '{}'),
            itemIndex,
        );
    }
    if (queryMode === 'odata' && nodeVersion >= 1.3) {
        return buildOptionsQuery.call(this, itemIndex);
    }

    const query: IDataObject = {};

    const selectAllFields = readParam.call(this, 'selectAllFields', itemIndex, true) as boolean;
    if (!selectAllFields) {
        const fieldNames = readSelectFieldNames.call(
            this,
            readParam.call(this, 'selectFields.fields', itemIndex, []),
        );
        if (options.includeRecId && !fieldNames.includes('RecId')) {
            fieldNames.unshift('RecId');
        }
        query['$select'] = fieldNames.join(',');
    }

    // The "Define Filter as JSON" toggle only exists on version 1.
    const useRawFilter =
        nodeVersion < 1.1 && (readParam.call(this, 'useRawFilter', itemIndex, false) as boolean);
    const odataFilterCollection = useRawFilter
        ? parseRawFilter.call(this, readParam.call(this, 'rawFilter', itemIndex, '[]'))
        : (readParam.call(this, 'odataFilter.odataFilter', itemIndex, []) as ODataFilterEntry[]);
    if (odataFilterCollection.length > 0) {
        const filterStrings = odataFilterCollection.map((filter, index) => {
            assertSafeFieldName.call(this, filter.fieldName);
            const prefix = index === 0 ? '' : ` ${filter.logicalOperator} `;

            if (filter.operation === 'isnull') {
                return `${prefix}${filter.fieldName} eq null`;
            }
            if (filter.operation === 'isnotnull') {
                return `${prefix}${filter.fieldName} ne null`;
            }

            const parsedValue = parseValue.call(this, filter.fieldType, filter.value);
            return `${prefix}${filter.fieldName} ${filter.operation} ${parsedValue}`;
        });
        query['$filter'] = filterStrings.join('');
    }

    const orderBy = String(readParam.call(this, 'orderBy', itemIndex, '') ?? '').trim();
    if (orderBy) {
        assertSafeFieldName.call(this, orderBy);
        // Ivanti answers an unknown direction (e.g. "ascending") with 204 No
        // Content, which would look like "no records", so refuse it here.
        const orderDirection = String(readParam.call(this, 'orderDirection', itemIndex, 'asc') ?? '')
            .trim()
            .toLowerCase();
        if (orderDirection !== 'asc' && orderDirection !== 'desc') {
            throw new NodeOperationError(this.getNode(), `Invalid order direction: "${orderDirection}"`, {
                description: 'Use "asc" or "desc"',
            });
        }
        query['$orderby'] = `${orderBy} ${orderDirection}`;
    }

    return query;
}