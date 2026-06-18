import type {
    IDataObject,
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from '../../transports'
import { validateBusinessObject } from '../../common';

/**
 * UI property definitions for the **Business Object → Search By Keyword** operation.
 *
 * Exposes:
 * - `object` – plural OData entity name
 * - `returnAll` / `limit` – pagination controls
 * - `searchText` – keyword passed as OData `$search`
 * - `selectAllFields` / `selectFields` – field projection (`$select`)
 */
export const properties: INodeProperties[] = [
    {
        displayName: "Business Object",
        name: "object",
        type: "string",
        default: "",
        noDataExpression: false,
        required: true,
        description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",

    },
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        description: 'Whether to return all results or only up to a given limit',
    },
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        noDataExpression: true,
        typeOptions: {
            minValue: 1,
        },
        description: 'Max number of results to return',
        displayOptions: {
            show: {
                returnAll: [false],
            },
        },
    },
    {
        displayName: 'Search Text',
        name: 'searchText',
        type: 'string',
        default: '',
        required: true,
        description: 'The text to search for in the specified business object',
    },
    {
        displayName: 'Select All Fields',
        name: 'selectAllFields',
        type: 'boolean',
        default: true,
        noDataExpression: false,
        description: 'Whether to select all fields or not',
    },
    {
        displayName: 'Select Fields',
        name: 'selectFields',
        placeholder: 'Add Select Field',
        type: 'fixedCollection',
        default: [],
        noDataExpression: false,
        typeOptions: {
            multipleValues: true,
        },
        description: 'Select the fields to return',
        options: [
            {
                name: 'fields',
                displayName: 'Field',
                values: [
                    {
                        displayName: 'Name',
                        name: 'name',
                        type: 'string',
                        default: 'Name',
                        noDataExpression: true,

                    },
                ],
            },
        ],
        displayOptions: {
            show: {
                selectAllFields: [false],
            },
        },
    },
]

const displayOptions = {
    show: {
        resource: ['businessobject'],
        operation: ['searchByKeyword'],
    },
};

export const description = updateDisplayOptions(displayOptions, properties);


/**
 * Executes the **Business Object → Search By Keyword** operation.
 *
 * Uses the OData `$search` parameter to perform a keyword search against
 * `GET /odata/businessobject/{object}`. Supports optional field projection
 * and both paginated and full result-set modes.
 *
 * @throws {NodeOperationError} when `object` is empty, does not end with `s`,
 *   `searchText` is empty, or `limit` is negative
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    try {
        for (let i = 0; i < items.length; i++) {

            const object = this.getNodeParameter('object', i) as string;

            validateBusinessObject.call(this, object);


            const selectAllFields = this.getNodeParameter('selectAllFields', i) as boolean;
            const baseUrl = `/odata/businessobject/${object}`;
            let select = '';
            if (!selectAllFields) {
                const selectFieldsCollection = this.getNodeParameter('selectFields.fields', 0, []) as { name: string }[];
                if (selectFieldsCollection.length !== 0) {
                    select += selectFieldsCollection.map(field => field.name).join(',');
                }
            }
            const limit = this.getNodeParameter('limit', i) as number;

            if (limit < 0) {
                throw new NodeOperationError(this.getNode(), 'The limit must be a non-negative number');
            }
            const searchText = this.getNodeParameter('searchText', i) as string;

            if (!searchText) {
                throw new NodeOperationError(this.getNode(), 'The search text is required');
            }
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;


            const records: IDataObject[] = [];


            if (returnAll) {
                const allRecords = await ivantiApiRequestAllItems.call(
                    this, 'GET', baseUrl,
                    { "$select": select || undefined, "$search": searchText },
                    undefined,
                );
                records.push(...allRecords);
            } else {
                const allRecords = await ivantiApiRequestAllItemsWithLimit.call(
                    this, 'GET', baseUrl,
                    { "$select": select || undefined, "$search": searchText },
                    undefined,
                    limit,
                );
                records.push(...allRecords);
            }
            const executionData = this.helpers.constructExecutionMetaData(

                this.helpers.returnJsonArray(records),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);
        }

    } catch (error) {
        if (this.continueOnFail()) {
            returnData.push({ json: { error: (error as Error).message } });
        } else {
            throw error;
        }
    }
    return returnData;
}


export interface SearchResponse {
    "@odata.context": string
    "@odata.count": number,
    value: IDataObject[]
}
