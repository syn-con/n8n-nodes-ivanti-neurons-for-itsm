import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';


import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequestBinary } from '../../transports'


/**
 * UI property definitions for the **Attachment → Read** operation.
 *
 * Exposes:
 * - `attachmentId` – ID of the attachment to download
 */
export const properties: INodeProperties[] = [

    //attachment id
    {
        displayName: "Attachment ID",
        name: "attachmentId",
        type: "string",
        required: true,
        description: "The ID of the attachment to retrieve",
        default: "",
        placeholder: "",
    },
]
const displayOptions = {
    show: {
        resource: ['attachment'],
        operation: ['read'],
    },
};
export const description = updateDisplayOptions(displayOptions, properties);


/**
 * Executes the **Attachment → Read** operation.
 *
 * Downloads a file from `GET /rest/Attachment?ID={attachmentId}` using the binary
 * transport helper and converts it to an n8n binary data item. The filename is
 * extracted from the `Content-Disposition` response header when available.
 * The original input item's JSON is preserved alongside the binary data.
 *
 * @throws {NodeOperationError} when `attachmentId` is empty or the API returns no response
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    for (let i = 0; i < items.length; i++) {

        try {

            const attachmentId = this.getNodeParameter('attachmentId', i) as string;
            if (attachmentId === '') {
                throw new NodeOperationError(this.getNode(), 'The "Attachment ID" parameter is required!');
            }
            const response = await ivantiApiRequestBinary.call(this, 'GET', `/rest/Attachment?ID=${attachmentId}`);
            if (!response) {
                throw new NodeOperationError(this.getNode(), 'No response from Ivanti API');
            }
            const headers = response.headers;
            const contentType = headers['content-type'] as string | undefined;
            const contentDisposition = headers['content-disposition'] as string | undefined;
            const attachmentName = contentDisposition
                ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
                : 'unknown';
            const binaryData = await this.helpers.prepareBinaryData(
                response.body,
                attachmentName as string,
                contentType as string,
            );
            returnData.push({
                json: items[i].json,
                binary: {
                    data: binaryData,
                },
            });
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
