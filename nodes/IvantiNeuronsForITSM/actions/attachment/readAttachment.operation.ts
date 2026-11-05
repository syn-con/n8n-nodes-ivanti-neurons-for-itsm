import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';


import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequestBinary } from '../../transports'
import { continueOnFailItem, itemError } from '../itemErrors';
import { getOverrideHeaders } from '../requestOptions';
import { assertSafeRecordId, parseContentDispositionFilename } from '../../common';


/**
 * UI property definitions for the **Attachment → Read** operation.
 *
 * Exposes:
 * - `attachmentId` – ID of the attachment to download
 * - `binaryPropertyName` – binary field the file is written to (default `data`)
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
    {
        displayName: 'Put Output File in Field',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        required: true,
        hint: 'The name of the output binary field to put the file in',
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
 * Streams a file from `GET /rest/Attachment?ID={attachmentId}` into n8n binary
 * data, under the binary field named by `binaryPropertyName`. The file name is
 * read from the `Content-Disposition` response header (RFC 6266). The input
 * item's JSON and its other binary fields are kept.
 *
 * @throws {NodeOperationError} when `attachmentId` is empty or the API returns no response
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    for (let i = 0; i < items.length; i++) {

        try {

            const attachmentId = String(this.getNodeParameter('attachmentId', i) ?? '').trim();
            if (attachmentId === '') {
                throw new NodeOperationError(this.getNode(), 'The "Attachment ID" parameter is required!');
            }
            assertSafeRecordId.call(this, attachmentId);
            const binaryPropertyName = String(this.getNodeParameter('binaryPropertyName', i, 'data') ?? '').trim();
            if (binaryPropertyName === '') {
                throw new NodeOperationError(this.getNode(), 'The "Put Output File in Field" parameter is required', { itemIndex: i });
            }
            const response = await ivantiApiRequestBinary.call(this, 'GET', `/rest/Attachment?ID=${encodeURIComponent(attachmentId)}`, {}, getOverrideHeaders.call(this, i));
            if (!response) {
                throw new NodeOperationError(this.getNode(), 'No response from Ivanti API');
            }
            const headers = response.headers;
            const contentType = headers['content-type'] as string | undefined;
            const contentDisposition = headers['content-disposition'] as string | undefined;
            const attachmentName = parseContentDispositionFilename(contentDisposition) ?? 'unknown';
            const binaryData = await this.helpers.prepareBinaryData(
                response.body,
                attachmentName,
                contentType,
            );
            returnData.push({
                json: items[i].json,
                binary: {
                    ...items[i].binary,
                    [binaryPropertyName]: binaryData,
                },
                pairedItem: { item: i },
            });
        } catch (error) {

            if (this.continueOnFail()) {
                returnData.push(continueOnFailItem(error, i));
                continue;
            }

            throw itemError.call(this, error, i);
        }
    }

    return returnData;

}
