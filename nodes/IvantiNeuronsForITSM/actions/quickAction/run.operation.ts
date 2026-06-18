



import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';



import { updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
import { assertSafePathSegment, assertSafeRecordId, toActualObjectType, validateBusinessObject } from '../../common';


/**
 * UI property definitions for the **Quick Action → Run** operation.
 *
 * Exposes:
 * - `businessObject` – plural OData entity name (e.g. `Incidents`)
 * - `recordId` – GUID of the record to run the action on
 * - `quickAction` – display name of the quick action (e.g. `Assign to Me`)
 * - `quickActionId` – GUID of the quick action definition
 */
export const properties: INodeProperties[] = [
	//Business Object
	{
		displayName: 'Business Object',
		name: 'businessObject',
		type: 'string',
		noDataExpression: false,
		required: true,
		default: '',
		description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",
	},
	//Record ID
	{
		displayName: 'Record ID',
		name: 'recordId',
		type: 'string',
		required: true,
		default: '',
		noDataExpression: false,
		description: 'The record ID to run the quick action on. The Guid format is "07E1BD1BF5804E67B8E76B26FA6EF9A0".',
	},

	{
		displayName: 'Quick Action',
		name: 'quickAction',
		type: 'string',
		required: true,
		default: '',
		noDataExpression: false,
		description: 'The quick action name to run. e.g., "Assign to Me".',
	},
	//Quick Action ID
	{
		displayName: 'Quick Action ID',
		name: 'quickActionId',
		type: 'string',
		required: true,
		default: '',
		noDataExpression: false,
		description: 'The ID of the quick action to run. The Guid format is "07E1BD1BF5804E67B8E76B26FA6EF9A0".',
	},
]
const displayOptions = {
	show: {
		resource: ['quickAction'],
		operation: ['run'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Executes the **Quick Action → Run** operation.
 *
 * Posts to `POST /odata/businessobject/{object}('{recordId}')/{quickAction}` with
 * a standard quick-action payload containing `ActionId`, `ShouldSave: true`, and
 * `ActionParams` (including `objectId` and `actualObjectType` derived by stripping
 * the trailing `s` from the business object name and appending `#`).
 *
 * @throws {NodeOperationError} when `businessObject` is empty or does not end with `s`
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			const businessObject = this.getNodeParameter('businessObject', i) as string;

			validateBusinessObject.call(this, businessObject);

			const quickAction = this.getNodeParameter('quickAction', i) as string;
			const recordId = this.getNodeParameter('recordId', i) as string;
			const quickActionId = this.getNodeParameter('quickActionId', i) as string;

			assertSafePathSegment.call(this, businessObject, 'Business Object');
			assertSafePathSegment.call(this, quickAction, 'Quick Action');
			assertSafeRecordId.call(this, recordId);

			const baseUrl = `/odata/businessobject/${businessObject}('${encodeURIComponent(recordId)}')/${quickAction}`;

			const quickActionPayload = {
				ActionId: quickActionId,
				ShouldSave: true,
				ActionParams: {
					GridParams: null,
					FormParams: {
						actionId: quickActionId,
						objectId: recordId,
						actualObjectType: toActualObjectType(businessObject),
					}
				},
				promptParams: null
			}
			const response = await ivantiApiRequest.call(this, 'POST', baseUrl, {}, quickActionPayload);
			const responseData = response as IDataObject;
			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(responseData),
				{ itemData: { item: i } },
			);
			returnData.push(...executionData);
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: { error: (error as Error).message } });
			} else {
				throw error;
			}
		}
	}




	return returnData;
}
