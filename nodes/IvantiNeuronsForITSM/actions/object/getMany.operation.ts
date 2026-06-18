import type {
    IDataObject,
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';



import { updateDisplayOptions } from 'n8n-workflow';
import { odataListProperties } from '../../odata/queryProperties';
import { buildODataQuery } from '../../odata/queryBuilder';

import { fetchRecords, } from '../../transports'
import { validateBusinessObject } from '../../common';

/**
 * UI property definitions for the **Business Object → Get Many** operation.
 *
 * Exposes:
 * - `object` – plural OData entity name
 * - `returnAll` / `limit` – pagination controls
 * - `selectAllFields` / `selectFields` – field projection (`$select`)
 * - `odataFilter` – multi-condition OData `$filter` builder
 * - `orderBy` / `orderDirection` – result ordering (`$orderby`)
 */
export const properties: INodeProperties[] = [
    {
        displayName: "Business Object",
        name: "object",
        type: "string",
        default: "",
        required: true,
        noDataExpression: true,
        description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",

    },
    ...odataListProperties,
];

const displayOptions = {
    show: {
        resource: ['businessobject'],
        operation: ['getMany'],
    }
}


export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Executes the **Business Object → Get Many** operation.
 *
 * Fetches records from `GET /odata/businessobject/{object}` with optional OData
 * `$filter`, `$select`, and `$orderby` parameters built from node inputs.
 *
 * - When `returnAll` is `true`, all pages are fetched via `ivantiApiRequestAllItems`.
 * - When `limit > 100`, pages are fetched via `ivantiApiRequestAllItemsWithLimit`.
 * - Otherwise a single request with `$top` is issued.
 *
 * @throws {NodeOperationError} when `object` is empty or does not end with `s`
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

    const items = this.getInputData();

    const returnData: INodeExecutionData[] = [];
    try {
        for (let i = 0; i < items.length; i++) {

            const object = this.getNodeParameter('object', i) as string;

            validateBusinessObject.call(this, object);

            const returnAll = this.getNodeParameter('returnAll', i) as boolean;

            const baseUrl = `/odata/businessobject/${object}`;

            const records: IDataObject[] = [];
            const odataQuery = buildODataQuery.call(this, i) as IDataObject;

            const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
            const allRecords = await fetchRecords.call(
                this,
                baseUrl,
                odataQuery,
                { returnAll, limit },
            );
            records.push(...allRecords);


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