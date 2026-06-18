import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
    IDataObject,
} from 'n8n-workflow';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
import { assertSafeRecordId, validateBusinessObject } from '../../common';

/**
 * UI property definitions for the **Business Object → Get By Record ID** operation.
 *
 * Exposes:
 * - `businessObject` – plural OData entity name (e.g. `Incidents`)
 * - `recordId` – GUID of the record to retrieve
 */
export const properties: INodeProperties[] = [
    {
        displayName: "Business Object",
        name: "object",
        default: "",
        type: "string",
        required: true,
        noDataExpression: false,
        description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",

        placeholder: "Incidents",
    },

    //rec id
    {
        displayName: "Record ID",
        name: "recordId",
        type: "string",
        required: true,
        description: "The ID of the record to retrieve. The Guid format is '07E1BD1BF5804E67B8E76B26FA6EF9A0'.",
        default: "",
        placeholder: "",
    },
]

const displayOptions = {
    show: {
        resource: ['businessobject'],
        operation: ['getByRecId'],
    },
};

export const description = updateDisplayOptions(displayOptions, properties);



/**
 * Executes the **Business Object → Get By Record ID** operation.
 *
 * Issues `GET /odata/businessobject/{object}('{recordId}')` for each input item
 * and returns the single matching record. The `@odata.context` key is stripped.
 *
 * @throws {NodeOperationError} when `businessObject` is empty, does not end with `s`,
 *   or when `recordId` is empty
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {


    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
        try {


            const object = this.getNodeParameter('object', i) as string;
            validateBusinessObject.call(this, object);
            const baseUrl = `/odata/businessobject/${object}`;


            const recordId = this.getNodeParameter('recordId', i) as string;
            if (recordId === '') {
                throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
            }
            assertSafeRecordId.call(this, recordId);

            const fullUrl = `${baseUrl}('${encodeURIComponent(recordId)}')`;
            const response = await ivantiApiRequest.call(this, 'GET', fullUrl, {}, undefined);
            const responseData = response as IDataObject;
            if (responseData['@odata.context']) {
                delete responseData['@odata.context'];
            }
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(responseData),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);
        } catch (error) {
            if (this.continueOnFail()) {

                returnData.push({ json: { error: (error as Error).message } });

            } else {
                throw error;
            }
        }
    }

    return returnData;

}
