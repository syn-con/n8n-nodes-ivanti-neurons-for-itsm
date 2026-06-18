

import type { INodeProperties } from 'n8n-workflow';

import * as getRelated from './getRelated.operation';
import * as link from './link.operation';
import * as unlink from './unlink.operation';

/** Re-export all Relationship operation modules for use by the router. */
export { getRelated, link, unlink };

export const description: INodeProperties[] = [
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        placeholder: 'Select an operation',
        options: [
            {
                name: 'Get Related',
                value: 'getRelated',
                description: 'Get related records',
                action: 'Get related records',
            },
            {
                name: 'Link',
                value: 'link',
                description: 'Link records',
                action: 'Link records',
            },
            {
                name: 'Unlink',
                value: 'unlink',
                description: 'Unlink records',
                action: 'Unlink records',
            }
        ],
        default: 'getRelated',
        displayOptions: {
            show: {
                resource: ['relationship'],
            }
        }
    },
    ...getRelated.description,
    ...link.description,
    ...unlink.description,
];
