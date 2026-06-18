import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';

import { updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
import { validateBusinessObject } from '../../common';

/**
 * UI property definitions for the **Business Object → Delete By Record ID** operation.
 *
 * Exposes:
 * - `businessObject` – plural OData entity name (e.g. `Incidents`)
 * - `recordId` – GUID of the record to delete
 */
export const properties: INodeProperties[] = [
    {
        displayName: "Business Object",
        name: "object",
        default: "incident",
        type: "string",
        required: true,
        noDataExpression: true,
        description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",

        placeholder: "Incidents",
    },

    //rec id
    {
        displayName: "Record ID",
        name: "recordId",
        type: "string",
        required: true,
        description: "The ID of the record to delete. The Guid format is '07E1BD1BF5804E67B8E76B26FA6EF9A0'.",
        default: "",
        placeholder: "",
    }
]

const displayOptions = {
    show: {
        resource: ['businessobject'],
        operation: ['deleteByRecId'],
    },
};

export const description = updateDisplayOptions(displayOptions, properties);



/**
 * Executes the **Business Object → Delete By Record ID** operation.
 *
 * Issues `DELETE /odata/businessobject/{object}('{recordId}')` for each input item.
 * Returns `{ success: true }` on success.
 *
 * @throws {NodeOperationError} when `businessObject` is empty or does not end with `s`
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

            const fullUrl = `${baseUrl}('${recordId}')`;

            await ivantiApiRequest.call(this, 'DELETE', fullUrl, {}, undefined);

            returnData.push({ json: { success: true } });


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
