import type { INodeProperties } from 'n8n-workflow';

import * as run from './run.operation';

export { run };

export const description: INodeProperties[] = [
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        placeholder: 'Select an operation',
        options: [
            { name: 'Run', value: 'run', description: 'Run a quick action', action: 'Run a quick action' },
        ],
        default: 'run',
        displayOptions: {
            show: {
                resource: ['quickAction'],
            }
        }
    },
    ...run.description,
];

