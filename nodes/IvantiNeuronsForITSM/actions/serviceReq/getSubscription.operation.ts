
import  {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import {  updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'


const baseUrl = "/rest/Template";

/**
 * UI property definitions for the **Service Request → Get Subscription** operation.
 *
 * Exposes:
 * - `employeeId` – GUID of the employee whose service catalogue subscriptions to fetch
 * - `simplifyResponse` – when true, trims the response to only the key subscription fields
 */
export const properties: INodeProperties[] = [

	{
		displayName: 'Employee ID',
		name: 'employeeId',
		type: 'string',
		required: true,
		description: 'The ID of the employee to get the subscription for. The Guid format is "07E1BD1BF5804E67B8E76B26FA6EF9A0".',
		default: '',
	},
	//bool simplify response
	{
		displayName: 'Simplify Response',
		name: 'simplifyResponse',
		type: 'boolean',
		default: false,
		description: 'Whether to simplify the response. If true, the response will be simplified to only include the subscription ID, service request template ID, service request template name, and service request template description.',
	}

]
const displayOptions = {
	show: {
		resource: ['serviceReq'],
		operation: ['getSubscription'],
	},
};
export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Executes the **Service Request → Get Subscription** operation.
 *
 * Calls `GET /rest/Template/{employeeId}/_All_` to retrieve all service catalogue
 * subscriptions available to the given employee. When `simplifyResponse` is `true`,
 * each item is trimmed to `{ subscriptionId, serviceReqTemplateId, serviceReqTemplateName,
 * serviceReqTemplateDescription }`. The result is always wrapped in
 * `{ employeeId, subscriptions: [...] }`.
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];

	const items = this.getInputData();

	for (let i = 0; i < items.length; i++) {
		try {
			const employeeId = this.getNodeParameter('employeeId', i) as string;
			const simplifyResponse = this.getNodeParameter('simplifyResponse', i) as boolean;
			const fullUrl = `${baseUrl}/${employeeId}/_All_`;
			const response = await ivantiApiRequest.call(this, 'GET', fullUrl, {}, undefined) as IDataObject[];

			let responseData = response;
			if (simplifyResponse) {
				responseData = responseData.map(item => {
					return {
						subscriptionId: item.strSubscriptionId,
						serviceReqTemplateId: item.strRecId,
						serviceReqTemplateName: item.strName,
						serviceReqTemplateDescription: item.strDescription,
					};
				});
			}
			returnData.push({
				json: {
					employeeId: employeeId,
					subscriptions: responseData,
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
