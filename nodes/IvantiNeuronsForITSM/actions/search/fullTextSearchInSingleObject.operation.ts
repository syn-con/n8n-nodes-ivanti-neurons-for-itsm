import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
    IDataObject,
} from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

/** Maximum page size accepted by the Ivanti full-text search endpoint. */
const MAX_LIMIT = 25;

/**
 * UI property definitions for the **Search → Full Text Search in Single Object** operation.
 *
 * Exposes:
 * - `searchObject` – business object type to search (singular, e.g. `Incident`)
 * - `searchText` – text to search for
 * - `returnAll` / `limit` – pagination controls
 */
export const properties: INodeProperties[] = [
    {
        displayName: "Business Object",
        name: "searchObject",
        type: "string",
        default: "",
        required: true,
        noDataExpression: true,
        description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",
    },
    {
        displayName: 'Search Text',
        name: 'searchText',
        type: 'string',
        default: '',
        required: true,
        description: 'The text to search for in the single object. e.g., "1234567890".',
    },
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        description: 'Whether to return all results or only up to a given limit',
    },
    //limit
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        required: true,
        typeOptions: {
            minValue: 1,
        },
        displayOptions: {
            show: {
                returnAll: [false],
            },
        },
        description: 'Max number of results to return',
    }

];

const displayOptions = {
    show: {
        resource: ['search'],
        operation: ['fullTextSearchInSingleObject'],
    }
}

export const description = updateDisplayOptions(displayOptions, properties);



/**
 * Executes the **Search → Full Text Search in Single Object** operation.
 *
 * Posts to `POST /rest/search/fulltext` with `{ Text, ObjectType }` and pages
 * through results in batches of `MAX_LIMIT` (25). When `returnAll` is `true`,
 * fetches until `totalRows` is reached or the server returns an empty page.
 * When a `limit` is set, stops once the limit is satisfied.
 *
 * @throws {NodeOperationError} when `searchObject` or `searchText` are empty
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

    const returnData: INodeExecutionData[] = [];
    const items = this.getInputData();
    for (let i = 0; i < items.length; i++) {
        try {
            const searchObject = this.getNodeParameter('searchObject', i) as string;
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;
            if (searchObject === '') {
                throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
            }


            const searchText = this.getNodeParameter('searchText', i) as string;
            if (searchText === '') {
                throw new NodeOperationError(this.getNode(), 'The "Search Text" parameter is required!');
            }
            const body = {
                "Text": searchText,
                "ObjectType": searchObject,
            } as IDataObject;
            const data: IDataObject[] = [];
            if (returnAll) {
                let skip = 0;
                body["$top"] = MAX_LIMIT;
                while (true) {
                    body["$skip"] = skip;
                    const response = await ivantiApiRequest.call(this, 'POST', '/rest/search/fulltext', {}, body);
                    if (!response?.data?.length) {
                        break;
                    }
                    data.push(...response.data);
                    if (response.data.length < MAX_LIMIT || data.length >= response.totalRows) {
                        break;
                    }
                    skip += MAX_LIMIT;
                }
            } else {
                const limit = this.getNodeParameter('limit', i) as number;
                let skip = 0;
                while (data.length < limit) {
                    const remaining = limit - data.length;
                    body["$top"] = Math.min(remaining, MAX_LIMIT);
                    body["$skip"] = skip;
                    const response = await ivantiApiRequest.call(this, 'POST', '/rest/search/fulltext', {}, body);
                    if (!response?.data?.length) {
                        break;
                    }
                    data.push(...response.data);
                    if (response.data.length < MAX_LIMIT || data.length >= response.totalRows) {
                        break;
                    }
                    skip += response.data.length;
                }
            }
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(data),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);

        } catch (error) {
            if (this.continueOnFail()) {
                returnData.push({ json: { error: (error as Error).message } });
                continue;
            }
            throw error;
        }
    };

    return returnData;
}

