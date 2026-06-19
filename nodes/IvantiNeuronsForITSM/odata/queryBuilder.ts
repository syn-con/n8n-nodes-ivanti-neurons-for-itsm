import type { IDataObject, IExecuteFunctions, IPollFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { assertSafeFieldName, parseBoolean } from '../common';


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
 * Converts a raw string value from the OData filter UI into the correct OData literal.
 *
 * - `string`  -> wrapped in single quotes
 * - `number`  -> parsed as a JS number
 * - `boolean` -> coerced to boolean
 * - `date`    -> parsed and returned as an ISO 8601 string
 * - anything else -> null
 *
 * @throws {NodeOperationError} when the value cannot be parsed for the given type
 */
export function parseValue(
    this: QueryCtx,
    fieldType: string,
    value: unknown,
): string | number | boolean | null {
    // The UI value can arrive as something other than a string (e.g. a number,
    // boolean, null or undefined) depending on how the fixedCollection is
    // populated. Normalize to a string first so the per-type parsers below never
    // hit a runtime "x is not a function" type error.
    if (value === undefined || value === null) {
        throw new NodeOperationError(
            this.getNode(),
            `A value is required for a "${fieldType}" filter`,
        );
    }
    const stringValue = typeof value === 'string' ? value : String(value);

    if (fieldType === 'string') {
        return `'${stringValue}'`;
    }
    if (fieldType === 'number') {
        const num = Number(stringValue);
        if (isNaN(num)) {
            throw new NodeOperationError(this.getNode(), `Invalid number: ${stringValue}`);
        }
        return num;
    }
    if (fieldType === 'boolean') {
        return parseBoolean.call(this, stringValue);
    }
    if (fieldType === 'date') {
        const date = new Date(stringValue);
        if (isNaN(date.getTime())) {
            throw new NodeOperationError(this.getNode(), `Invalid date: ${stringValue}`);
        }
        return date.toISOString();
    }
    return null;
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

    const odataFilterCollection = this.getNodeParameter(
        'odataFilter.odataFilter',
        itemIndex,
        [],
    ) as ODataFilterEntry[];
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