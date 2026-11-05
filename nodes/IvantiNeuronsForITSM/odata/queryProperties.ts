import type { INodeProperties } from 'n8n-workflow';

/** Shows a parameter only on node version 1.1 and later. */
const FROM_V1_1 = { '@version': [{ _cnd: { gte: 1.1 } }] };
/** Shows a parameter only on node versions 1.1 and 1.2. */
const V1_1_TO_V1_2 = { '@version': [{ _cnd: { between: { from: 1.1, to: 1.2 } } }] };
/** Shows a parameter only on node version 1.3 and later. */
const FROM_V1_3 = { '@version': [{ _cnd: { gte: 1.3 } }] };
/** Shows a parameter only on node version 1 (kept for existing workflows). */
const BEFORE_V1_1 = { '@version': [{ _cnd: { lt: 1.1 } }] };
/**
 * Hides a Manual-mode parameter in JSON mode. A `hide` rule is ignored when the
 * parameter it checks has no value, so on version 1 (where `queryMode` does not
 * exist) these parameters stay visible.
 */
const HIDE_IN_JSON_MODE = { queryMode: ['json'] };

/**
 * Shared OData list properties (Return All / Limit / Mode / Select / Filter / Order By).
 * The `object` (Business Object) property is intentionally NOT included here so
 * each caller can set its own default/placeholder; spread it in alongside this array.
 *
 * Version 1.1 adds the Mode switch:
 * - **Manual**: the field-by-field builder (Select Fields, OData Filter, Order By)
 * - **JSON**: a native OData query object sent to Ivanti as written
 * Version 1.3 keeps both modes and makes JSON mode stricter about its keys and
 * more forgiving about their spelling and values (see `parseNativeODataQuery`).
 * Version 1 keeps the "Define Filter as JSON" toggle instead.
 */
export const odataListProperties: INodeProperties[] = [
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        noDataExpression: true,
        default: false,
        description: 'Whether to return all results or only up to a given limit',
    },
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        typeOptions: { minValue: 1 },
        description: 'Max number of results to return',
        displayOptions: { show: { returnAll: [false] } },
    },
    {
        displayName: 'Mode',
        name: 'queryMode',
        type: 'options',
        noDataExpression: true,
        default: 'manual',
        options: [
            {
                name: 'Manual',
                value: 'manual',
                description: 'Build the query field by field',
            },
            {
                name: 'JSON',
                value: 'json',
                description: 'Write the OData query yourself; it is sent to Ivanti exactly as written',
            },
        ],
        displayOptions: { show: FROM_V1_1 },
    },
    {
        displayName: 'OData Query (JSON)',
        name: 'odataQuery',
        type: 'json',
        default:
            '{\n  "$filter": "Status eq \'Active\'",\n  "$select": "RecId,Subject,Status",\n  "$orderby": "CreatedDateTime desc"\n}',
        description:
            'OData query options sent to Ivanti exactly as written, for example "$filter", "$select" and "$orderby". Any OData syntax Ivanti supports can be used in the values. Paging ("$top" and "$skip") is controlled by Return All and Limit.',
        displayOptions: { show: { ...V1_1_TO_V1_2, queryMode: ['json'] } },
    },
    {
        // Same parameter as above, described for version 1.3, which checks the keys
        displayName: 'OData Query (JSON)',
        name: 'odataQuery',
        type: 'json',
        default:
            '{\n  "$filter": "Status eq \'Active\'",\n  "$select": "RecId,Subject,Status",\n  "$orderby": "CreatedDateTime desc"\n}',
        description:
            'The OData options $filter, $select and $orderby, with or without the $ sign. The values are sent to Ivanti as written. $select and $orderby may also be lists, e.g. ["LastModDateTime asc", "RecId asc"]. Paging ($top, $skip) is set by Return All and Limit.',
        hint: 'To fill in values from the input, switch the field to Expression and write e.g. "$filter": "RecId eq \'{{ $json.id }}\'", or pass a whole object with {{ $json.query }}',
        displayOptions: { show: { ...FROM_V1_3, queryMode: ['json'] } },
    },
    {
        displayName: 'Select All Fields',
        name: 'selectAllFields',
        type: 'boolean',
        default: true,
        description: 'Whether to select all fields or not',
        displayOptions: { hide: HIDE_IN_JSON_MODE },
    },
    {
        displayName: 'Select Fields',
        name: 'selectFields',
        placeholder: 'Add Select Field',
        type: 'fixedCollection',
        default: [],
        typeOptions: { multipleValues: true },
        description: 'The fields to select from the business object',
        options: [
            {
                name: 'fields',
                displayName: 'Field',
                values: [
                    { displayName: 'Name', name: 'name', type: 'string', placeholder: 'Name', default: '' },
                ],
            },
        ],
        displayOptions: { show: { selectAllFields: [false] }, hide: HIDE_IN_JSON_MODE },
    },
    {
        displayName: 'Define Filter as JSON',
        name: 'useRawFilter',
        type: 'boolean',
        default: false,
        description: 'Whether to define the OData filter conditions as a JSON array instead of using the filter builder',
        displayOptions: { show: BEFORE_V1_1 },
    },
    {
        displayName: 'Raw Filter (JSON)',
        name: 'rawFilter',
        type: 'json',
        default:
            '[\n  {\n    "fieldName": "Status",\n    "fieldType": "string",\n    "operation": "eq",\n    "value": "Active",\n    "logicalOperator": "and"\n  }\n]',
        description:
            'Array of filter conditions. Each condition takes "fieldName", "operation" (eq, ne, gt, ge, lt, le, isnull, isnotnull), "value", and optionally "fieldType" (string, number, boolean, date; default string) and "logicalOperator" (and, or; default and). A single condition object is also accepted.',
        displayOptions: { show: { ...BEFORE_V1_1, useRawFilter: [true] } },
    },
    {
        displayName: 'OData Filter',
        name: 'odataFilter',
        placeholder: 'Add OData Filter',
        type: 'fixedCollection',
        default: [],
        typeOptions: { multipleValues: true },
        // `hide` rather than `show: { useRawFilter: [false] }`: from version 1.1
        // the toggle does not exist, and a `show` rule on a missing value would
        // hide the builder as well.
        displayOptions: { hide: { useRawFilter: [true], ...HIDE_IN_JSON_MODE } },
        options: [
            {
                name: 'odataFilter',
                displayName: 'OData Filter',
                values: [
                    { displayName: 'Field Name', name: 'fieldName', type: 'string', default: '', description: 'Name of the field to filter by', required: true },
                    {
                        displayName: 'Field Type', name: 'fieldType', type: 'options', default: 'string',
                        description: 'The type of the field', required: true,
                        options: [
                            { name: 'Boolean', value: 'boolean' },
                            { name: 'Date', value: 'date' },
                            { name: 'Number', value: 'number' },
                            { name: 'String', value: 'string' },
                        ],
                    },
                    {
                        displayName: 'Logical Operator', name: 'logicalOperator', type: 'options', default: 'and',
                        options: [{ name: 'And', value: 'and' }, { name: 'Or', value: 'or' }],
                    },
                    {
                        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
                        default: 'eq', required: true,
                        options: [
                            { name: 'Equals', value: 'eq' },
                            { name: 'Greater Than', value: 'gt' },
                            { name: 'Greater Than or Equal', value: 'ge' },
                            { name: 'Is Not Null', value: 'isnotnull' },
                            { name: 'Is Null', value: 'isnull' },
                            { name: 'Less Than', value: 'lt' },
                            { name: 'Less Than or Equal', value: 'le' },
                            { name: 'Not Equals', value: 'ne' },
                        ],
                    },
                    {
                        displayName: 'Value', name: 'value', type: 'string', default: '',
                        description: 'The value to compare the field against', required: true,
                        displayOptions: { hide: { operation: ['isnull', 'isnotnull'] } },
                    },
                ],
            },
        ],
    },
    {
        displayName: 'Order By',
        name: 'orderBy',
        type: 'string',
        default: '',
        description: 'Field to order results by',
        placeholder: 'Name',
        displayOptions: { hide: HIDE_IN_JSON_MODE },
    },
    {
        displayName: 'Order Direction',
        name: 'orderDirection',
        type: 'options',
        default: 'asc',
        options: [{ name: 'Ascending', value: 'asc' }, { name: 'Descending', value: 'desc' }],
        displayOptions: { hide: HIDE_IN_JSON_MODE },
    },
];