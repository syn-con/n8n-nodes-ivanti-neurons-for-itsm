import type {
    IDataObject,
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';

import { extractValueArray, fetchRecords, ivantiApiRequest } from '../../transports'
import { continueOnFailItem, itemError } from '../itemErrors';
import { getOverrideHeaders } from '../requestOptions';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';
import { assertSafePathSegment, validateBusinessObject, validateSavedSearchName } from '../../common';



/**
 * UI property definitions for the **Search → Saved Search** operation.
 *
 * Exposes:
 * - `searchObject` – plural OData entity name the saved search belongs to
 * - `savedSearchName` – name of the saved search
 * - `savedSearchGUID` – GUID (`ActionId`) of the saved search
 * - `returnAll` / `limit` – pagination controls from node version 1.4
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
        placeholder: 'e.g. My_Active',
        description: 'The name of the saved search to execute. Spaces are not allowed — write them as underscores (e.g. "My Active" becomes "My_Active").',
    },
    {
        displayName: 'Saved Search GUID',
        name: 'savedSearchGUID',
        type: 'string',
        default: '',
        required: true,
        description: 'The GUID of the saved search to execute',
    },
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: true,
        description: 'Whether to return all results or only up to a given limit',
        displayOptions: { show: { '@version': [{ _cnd: { gte: 1.4 } }] } },
    },
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        typeOptions: { minValue: 1 },
        description: 'Max number of results to return',
        displayOptions: {
            show: {
                '@version': [{ _cnd: { gte: 1.4 } }],
                returnAll: [false],
            },
        },
    },
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
 * and returns the matching records from `response.value`. Version 1.4 pages
 * through all matches by default, or up to Limit when Return All is off.
 * Older node versions keep their single request without paging parameters.
 *
 * @throws {NodeOperationError} when `searchObject`, `savedSearchName`, or
 *   `savedSearchGUID` are empty, when `savedSearchName` contains spaces
 *   (Ivanti encodes them as "_", e.g. "My_Active"), or when the request fails
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

    const returnData: INodeExecutionData[] = [];
    const items = this.getInputData();


    for (let i = 0; i < items.length; i++) {
        try {

            const searchObject = this.getNodeParameter('searchObject', i) as string;
            validateBusinessObject.call(this, searchObject)


            assertSafePathSegment.call(this, searchObject, 'Business Object');

            const savedSearchName = validateSavedSearchName.call(
                this,
                this.getNodeParameter('savedSearchName', i) as string,
            );

            const savedSearchGUID = this.getNodeParameter('savedSearchGUID', i) as string;

            if (savedSearchGUID === '') {
                throw new NodeOperationError(this.getNode(), 'The "Saved Search GUID" parameter is required!');
            }


            const endpoint = `/odata/businessobject/${searchObject}/${savedSearchName}`;
            const query: IDataObject = { ActionId: savedSearchGUID };
            const headers = getOverrideHeaders.call(this, i);
            let records: IDataObject[];
            if (this.getNode().typeVersion >= 1.4) {
                const returnAll = this.getNodeParameter('returnAll', i, true) as boolean;
                const limit = returnAll ? undefined : this.getNodeParameter('limit', i, 50) as number;
                records = await fetchRecords.call(this, endpoint, query, { returnAll, limit, headers });
            } else {
                const response = await ivantiApiRequest.call(this, 'GET', endpoint, query, {}, headers);
                // An empty answer (HTTP 204, no match) becomes an empty list, not one empty item
                records = extractValueArray.call(this, response);
            }
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(records),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);
        } catch (error) {
            if (this.continueOnFail()) {
                returnData.push(continueOnFailItem(error, i));
            } else {
                throw itemError.call(this, error, i);
            }
        }
    }

    return returnData;

}
