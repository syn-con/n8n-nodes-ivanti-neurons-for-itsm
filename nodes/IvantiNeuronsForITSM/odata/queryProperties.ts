import type { INodeProperties } from 'n8n-workflow';

/**
 * Shared OData list properties (Return All / Limit / Select / Filter / Order By).
 * The `object` (Business Object) property is intentionally NOT included here so
 * each caller can set its own default/placeholder; spread it in alongside this array.
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
        displayName: 'Select All Fields',
        name: 'selectAllFields',
        type: 'boolean',
        default: true,
        description: 'Whether to select all fields or not',
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
        displayOptions: { show: { selectAllFields: [false] } },
    },
    {
        displayName: 'OData Filter',
        name: 'odataFilter',
        placeholder: 'Add OData Filter',
        type: 'fixedCollection',
        default: [],
        typeOptions: { multipleValues: true },
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
    },
    {
        displayName: 'Order Direction',
        name: 'orderDirection',
        type: 'options',
        default: 'asc',
        options: [{ name: 'Ascending', value: 'asc' }, { name: 'Descending', value: 'desc' }],
    },
];