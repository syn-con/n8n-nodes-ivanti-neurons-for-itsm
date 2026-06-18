
import  {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type IDataObject,
} from 'n8n-workflow';

import {  updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequestAllItems } from '../../transports'

const serviceReqParamsUrl = "/odata/businessobject/ServiceReqTemplateParams";

/**
 * UI property definitions for the **Service Request → Get Service Request Parameters** operation.
 *
 * Exposes:
 * - `serviceReqTemplateId` – GUID of the Service Request Template whose parameters to fetch
 */
export const properties: INodeProperties[] = [
	//subscription id
	{
		displayName: 'Service Request Template ID',
		name: 'serviceReqTemplateId',
		type: 'string',
		required: true,
		description: 'The ID of the subscription to get the service request parameters for. The Guid format is "07E1BD1BF5804E67B8E76B26FA6EF9A0".',
		default: '',
	},
]
const displayOptions = {
	show: {
		resource: ['serviceReq'],
		operation: ['getServiceReqParams'],
	},
};
export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Executes the **Service Request → Get Service Request Parameters** operation.
 *
 * Fetches all `ServiceReqTemplateParams` records whose `ParentLink_RecID` matches
 * the provided template ID. Useful for inspecting available parameters before
 * creating a service request.
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];

	const items = this.getInputData();

	for (let i = 0; i < items.length; i++) {
		try {
			const serviceReqTemplateId = this.getNodeParameter('serviceReqTemplateId', i) as string;
			const response = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
				$filter: `ParentLink_RecID eq '${serviceReqTemplateId}'`,
			});
			if(response === undefined) {
				continue;
			}
			const responseData = response as IDataObject[];
			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(responseData),
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
