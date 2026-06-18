import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

/**
 * UI property definitions for the **Search → Full Text Search Across All Objects** operation.
 *
 * Exposes:
 * - `searchText` – text to search for across all business objects
 */
export const properties: INodeProperties[] = [
    {
        displayName: 'Search Text',
        name: 'searchText',
        type: 'string',
        default: '',
        required: true,
        description: 'The text to search for across all objects. e.g., "1234567890".',
    }

];

const displayOptions = {
    show: {
        resource: ['search'],
        operation: ['fullTextSearchAcrossAllObjects'],
    }
}

export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Executes the **Search → Full Text Search Across All Objects** operation.
 *
 * Posts to `POST /rest/Search` with `{ Text }` and returns all matching results
 * across every business object type in the Ivanti instance.
 *
 * @throws {NodeOperationError} when `searchText` is empty or the request fails
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

    const returnData: INodeExecutionData[] = [];
    const items = this.getInputData();

    try {
        for (let i = 0; i < items.length; i++) {

            const searchTextAll = this.getNodeParameter('searchText', i) as string;
            if (searchTextAll === '') {
                throw new NodeOperationError(this.getNode(), 'The "Search Text" parameter is required!');
            }
            const responseAllData = await ivantiApiRequest.call(this, 'POST', `/rest/Search`, {}, {
                "Text": searchTextAll,
            });

            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(responseAllData),
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
