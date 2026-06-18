import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';
import { assertSafePathSegment, validateBusinessObject } from '../../common';



/**
 * UI property definitions for the **Search → Saved Search** operation.
 *
 * Exposes:
 * - `searchObject` – plural OData entity name the saved search belongs to
 * - `savedSearchName` – name of the saved search
 * - `savedSearchGUID` – GUID (`ActionId`) of the saved search
 */
export const properties: INodeProperties[] = [
    {
        displayName: "Business Object",
        name: "searchObject",
        type: "string",
        default: "",
        required: true,
        description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",
    },
    //saved search name
    {
        displayName: 'Saved Search Name',
        name: 'savedSearchName',
        type: 'string',
        default: '',
        required: true,
        description: 'The name of the saved search to execute',
    },
    {
        displayName: 'Saved Search GUID',
        name: 'savedSearchGUID',
        type: 'string',
        default: '',
        required: true,
        description: 'The GUID of the saved search to execute',
    }
];
const displayOptions = {
    show: {
        resource: ['search'],
        operation: ['savedSearch'],
    }
}

export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Executes the **Search → Saved Search** operation.
 *
 * Issues `GET /odata/businessobject/{object}/{savedSearchName}?ActionId={savedSearchGUID}`
 * and returns the matching records from `response.value`.
 *
 * @throws {NodeOperationError} when `searchObject`, `savedSearchName`, or
 *   `savedSearchGUID` are empty, or when the request fails
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

    const returnData: INodeExecutionData[] = [];
    const items = this.getInputData();


    try {
        for (let i = 0; i < items.length; i++) {

            const searchObject = this.getNodeParameter('searchObject', i) as string;
            validateBusinessObject.call(this, searchObject)


            const savedSearchName = this.getNodeParameter('savedSearchName', i) as string;
            if (savedSearchName === '') {
                throw new NodeOperationError(this.getNode(), 'The "Saved Search Name" parameter is required!');
            }
            assertSafePathSegment.call(this, searchObject, 'Business Object');
            assertSafePathSegment.call(this, savedSearchName, 'Saved Search Name');

            const savedSearchGUID = this.getNodeParameter('savedSearchGUID', i) as string;

            if (savedSearchGUID === '') {
                throw new NodeOperationError(this.getNode(), 'The "Saved Search GUID" parameter is required!');
            }


            const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(response.value),
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
