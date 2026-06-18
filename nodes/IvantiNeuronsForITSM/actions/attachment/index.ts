import type { INodeProperties } from 'n8n-workflow';

import * as read from './readAttachment.operation';
import * as upload from './uploadAttachment.operation';
import * as deleteOp from './delete.operation';

/** Re-export all Attachment operation modules for use by the router. */
export { read, upload, deleteOp };


export const description: INodeProperties[] = [
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        placeholder: 'Select an operation',
        options: [
            {
                value: 'deleteOp',
                name: 'Delete Attachment',
                description: 'Delete an existing attachment',
                action: 'Delete an attachment',
            },
            {
                value: 'read',
                name: 'Read Attachment',
                description: 'Retrieve an existing attachment. Returns binary data, so this operation is not usable when the node is called as an AI-agent tool.',
                action: 'Read an attachment',
            },
            {
                value: 'upload',
                name: 'Upload Attachment',
                description: 'Upload a new attachment. Reads binary input, so this operation is not usable when the node is called as an AI-agent tool.',
                action: 'Upload an attachment',
            },
        ],
        default: 'read',
        displayOptions: {
            show: {
                resource: ['attachment'],
            }
        }
    },
    ...read.description,
    ...upload.description,
    ...deleteOp.description
];