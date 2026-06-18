import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,

} from 'n8n-workflow';
import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';
import { ivantiApiRequestFormData } from '../../transports';
import { toActualObjectType, validateBusinessObject } from '../../common';

/**
 * UI property definitions for the **Attachment → Upload** operation.
 *
 * Exposes:
 * - `objectType` – business object type suffix (e.g. `Incident#`)
 * - `businessObjectId` – GUID of the parent record to attach the file to
 * - `binaryPropertyName` – name of the n8n binary property containing the file data
 */
export const properties: INodeProperties[] = [

    //ObjectType
    {
        displayName: "Object Type",
        name: "objectType",
        type: "string",
        noDataExpression: true,
        required: true,
        description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",
        default: "",
    },
    {
        displayName: "Business Object ID",
        name: "businessObjectId",
        type: "string",
        required: true,
        description: "The ID of the business object to associate the attachment with",
        default: "",
        placeholder: "",
    },

    //binary property   
    {
        displayName: 'Binary Property',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Name of the binary property which contains the data to be uploaded',
        placeholder: 'data',
        hint: 'The name of the binary property which contains the data to be uploaded',
    },


]

const displayOptions = {
    show: {
        resource: ['attachment'],
        operation: ['upload'],
    },
}

export const description = updateDisplayOptions(displayOptions, properties);




/**
 * Executes the **Attachment → Upload** operation.
 *
 * Reads binary data from the specified n8n binary property, assembles a
 * `multipart/form-data` request, and POSTs it to `POST /rest/Attachment`.
 * The trailing `s` is stripped from `objectType` and replaced with `#` to
 * match the Ivanti attachment API convention (e.g. `Incidents` → `Incident#`).
 *
 * @throws {NodeOperationError} when `objectType`, `businessObjectId`, or
 *   `binaryPropertyName` are empty, or when the binary data is missing
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];


    for (let i = 0; i < items.length; i++) {

        try {


            const objectType = this.getNodeParameter('objectType', 0) as string;

            validateBusinessObject.call(this, objectType);


            const businessObjectId = this.getNodeParameter('businessObjectId', i) as string;
            if (businessObjectId === '') {
                throw new NodeOperationError(this.getNode(), 'The "Business Object ID" parameter is required!');
            }

            const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
            if (binaryPropertyName === '') {
                throw new NodeOperationError(this.getNode(), 'The "Binary Property" parameter is required!');
            }
            const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
            const fileBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

            const formData = new FormData();
            formData.append('businessObjectId', businessObjectId);
            formData.append('objectType', toActualObjectType(objectType));

            const blob = new Blob([fileBuffer], { type: binaryData.mimeType });
            formData.append('file', blob, binaryData.fileName ?? 'upload');

            const response = await ivantiApiRequestFormData.call(this, 'POST', '/rest/Attachment', formData);
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(response),
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

    }
    return returnData;
}
