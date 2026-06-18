import { INodeProperties } from "n8n-workflow";

import * as getSubscription from './getSubscription.operation';
import * as getServiceReqParams from './getServiceReqParams.operation';
import * as create from './create.operation';
import * as createSimplified from './create.simplified.operation';


export { getSubscription, getServiceReqParams, create, createSimplified };



export const description: INodeProperties[] = [

	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		placeholder: 'Select an operation',
		options: [
			{ name: 'Create Service Request', value: 'createSimplified', action: 'Create a service request' },
			{ name: 'Create Service Request (Advanced)', value: 'create', action: 'Create a service request with advanced mode' },
			{ name: 'Get Service Request Parameters', value: 'getServiceReqParams', action: 'Get service request parameters' },
			{ name: 'Get Subscription', value: 'getSubscription', action: 'Get a subscription' },
		],
		default: 'getSubscription',
		displayOptions: {
			show: {
				resource: ['serviceReq'],
			},
		},
	},
	...getSubscription.description,
	...getServiceReqParams.description,
	...create.description,
	...createSimplified.description,
]
