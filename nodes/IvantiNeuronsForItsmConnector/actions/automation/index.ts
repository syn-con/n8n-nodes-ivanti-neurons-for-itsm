
import {
	type INodeProperties,
} from 'n8n-workflow';

import * as update from './update.operation';

export { update };


export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		placeholder: 'Select an operation',
		options: [
			{ name: 'Update Automation Transaction', value: 'update',action: 'Update an automation transaction' },
		],
		default: 'update',
		displayOptions: {
			show: {
				resource: ['automation'],
			},
		},
	},
	...update.description,
];




