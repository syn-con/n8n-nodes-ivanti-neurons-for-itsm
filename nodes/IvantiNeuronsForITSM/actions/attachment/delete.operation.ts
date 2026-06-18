import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';

import { updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'

/**
 * UI property definitions for the **Attachment → Delete** operation.
 *
 * Exposes:
 * - `attachmentId` – ID of the attachment to delete
 */
export const properties: INodeProperties[] = [
    {
        displayName: "Attachment ID",
        name: "attachmentId",
        type: "string",
        required: true,
        description: "The ID of the attachment to delete",
        default: "",
        placeholder: "",
    }
]
const displayOptions = {
    show: {
        resource: ['attachment'],
        operation: ['deleteOp'],
    },
};
export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Executes the **Attachment → Delete** operation.
 *
 * Issues `DELETE /rest/Attachment?ID={attachmentId}` for each input item
 * and returns `{ Message: 'Attachment deleted successfully' }` on success.
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    for (let i = 0; i < items.length; i++) {
        try {
            const attachmentId = this.getNodeParameter('attachmentId', i) as string;
            await ivantiApiRequest.call(this, 'DELETE', `/rest/Attachment?ID=${attachmentId}`, {}, undefined);
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray({
                    Message: 'Attachment deleted successfully',
                }),
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
