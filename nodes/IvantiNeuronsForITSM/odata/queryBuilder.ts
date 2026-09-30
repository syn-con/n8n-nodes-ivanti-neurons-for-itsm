import type { IDataObject, IExecuteFunctions, IPollFunctions } from 'n8n-workflow';
import { jsonParse, NodeOperationError } from 'n8n-workflow';
import { assertSafeFieldName, escapeODataString, parseBoolean } from '../common';


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

/**
 * Assembles an OData query object ($select, $filter, $orderby) from the node UI inputs.
 *
 * `getNodeParameter` is read positionally so the same signature works for both
 * `IExecuteFunctions` (which passes an item index) and `IPollFunctions`.
 *
 * Every filter field name is validated with `assertSafeFieldName`, so all callers
 * get OData-injection protection for free.
 */
export function buildODataQuery(
    this: QueryCtx,
    itemIndex: number,
    options: BuildODataQueryOptions = {},
): IDataObject {
    const query: IDataObject = {};

    const selectAllFields = this.getNodeParameter('selectAllFields', itemIndex) as boolean;
    if (!selectAllFields) {
        const selectFieldsCollection = this.getNodeParameter(
            'selectFields.fields',
            itemIndex,
            [],
        ) as Array<{ name: string }>;
        const fieldNames = selectFieldsCollection
            .map((f) => f.name)
            .filter((name) => name !== '' && name !== undefined && name !== null);
        if (options.includeRecId && !fieldNames.includes('RecId')) {
            fieldNames.unshift('RecId');
        }
        query['$select'] = fieldNames.join(',');
    }

    const useRawFilter = this.getNodeParameter('useRawFilter', itemIndex, false) as boolean;
    const odataFilterCollection = useRawFilter
        ? parseRawFilter.call(this, this.getNodeParameter('rawFilter', itemIndex, '[]'))
        : (this.getNodeParameter('odataFilter.odataFilter', itemIndex, []) as ODataFilterEntry[]);
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

    const orderBy = this.getNodeParameter('orderBy', itemIndex, '') as string;
    const orderDirection = this.getNodeParameter('orderDirection', itemIndex, 'asc') as string;
    if (orderBy) {
        query['$orderby'] = `${orderBy} ${orderDirection}`;
    }

    return query;
}