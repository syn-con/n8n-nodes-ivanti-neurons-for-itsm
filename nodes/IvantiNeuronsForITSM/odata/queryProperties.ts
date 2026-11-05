import type { INodeProperties } from 'n8n-workflow';

/** Shows a parameter only on node version 1.1 and later. */
const FROM_V1_1 = { '@version': [{ _cnd: { gte: 1.1 } }] };
/** Shows a parameter only on node versions 1.1 and 1.2 (the Manual / JSON switch). */
const V1_1_TO_V1_2 = { '@version': [{ _cnd: { between: { from: 1.1, to: 1.2 } } }] };
/** Shows a parameter only on node version 1.3 and later (adds the OData mode). */
const FROM_V1_3 = { '@version': [{ _cnd: { gte: 1.3 } }] };
/** Shows a parameter only on node version 1 (kept for existing workflows). */
const BEFORE_V1_1 = { '@version': [{ _cnd: { lt: 1.1 } }] };
/**
 * Hides a Manual-mode parameter in the other modes. A `hide` rule is ignored when
 * the parameter it checks has no value, so on version 1 (where `queryMode` does
 * not exist) these parameters stay visible.
 */
const HIDE_IN_JSON_MODE = { queryMode: ['json', 'odata'] };
/** Shows a parameter in the OData mode of version 1.3. */
const ODATA_MODE = { ...FROM_V1_3, queryMode: ['odata'] };

/**
 * Shared OData list properties (Return All / Limit / Mode / Select / Filter / Order By).
 * The `object` (Business Object) property is intentionally NOT included here so
 * each caller can set its own default/placeholder; spread it in alongside this array.
 *
 * Version 1.1 adds the Mode switch:
 * - **Manual**: the field-by-field builder (Select Fields, OData Filter, Order By)
 * - **JSON**: a native OData query object sent to Ivanti exactly as written
 * Version 1.3 adds a third mode between them, **OData**: one text field per
 * OData option (Filter, Select, Order By), and calls JSON **Advanced (JSON)**.
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
        displayOptions: { show: V1_1_TO_V1_2 },
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
                name: 'OData',
                value: 'odata',
                description: 'Write each OData option (filter, select, order) in its own field',
            },
            {
                name: 'Advanced (JSON)',
                value: 'json',
                description: 'Write the whole OData query as one JSON object; it is sent to Ivanti exactly as written',
            },
        ],
        displayOptions: { show: FROM_V1_3 },
    },
    {
        displayName: 'Filter',
        name: 'odataFilterExpression',
        type: 'string',
        default: '',
        placeholder: "Status eq 'Active' and Priority le 2",
        description: 'The OData $filter, sent to Ivanti as written. Leave empty to read every record.',
        displayOptions: { show: ODATA_MODE },
    },
    {
        displayName: 'With Return All and an empty Filter, every record of the business object is read. Add a Filter or turn off Return All.',
        name: 'returnAllWithoutFilterNotice',
        type: 'notice',
        default: '',
        displayOptions: { show: { ...ODATA_MODE, returnAll: [true], odataFilterExpression: [''] } },
    },
    {
        displayName: 'Select',
        name: 'odataSelect',
        type: 'string',
        default: '',
        placeholder: 'RecId,Subject,Status',
        description: 'The OData $select: field names separated by commas. Leave empty for all fields.',
        displayOptions: { show: ODATA_MODE },
    },
    {
        displayName: 'Order By',
        name: 'odataOrderBy',
        type: 'string',
        default: '',
        placeholder: 'CreatedDateTime desc',
        description: 'The OData $orderby: fields with an optional asc or desc, separated by commas',
        displayOptions: { show: ODATA_MODE },
    },
    {
        displayName: 'OData Query (JSON)',
        name: 'odataQuery',
        type: 'json',
        default:
            '{\n  "$filter": "Status eq \'Active\'",\n  "$select": "RecId,Subject,Status",\n  "$orderby": "CreatedDateTime desc"\n}',
        description:
            'OData query options sent to Ivanti exactly as written, for example "$filter", "$select" and "$orderby". Any OData syntax Ivanti supports can be used in the values. From node version 1.3, only these three keys are accepted. Paging ("$top" and "$skip") is controlled by Return All and Limit.',
        displayOptions: { show: { ...FROM_V1_1, queryMode: ['json'] } },
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