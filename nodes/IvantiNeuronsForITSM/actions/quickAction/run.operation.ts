



import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';



import { updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
import { continueOnFailItem, itemError } from '../itemErrors';
import { getOverrideHeaders } from '../requestOptions';
import { assertSafePathSegment, assertSafeRecordId, toActualObjectType, validateBusinessObject } from '../../common';
import { getPromptParameters } from './promptParameters';


/**
 * UI property definitions for the **Quick Action → Run** operation.
 *
 * Exposes:
 * - `businessObject` – plural OData entity name (e.g. `Incidents`)
 * - `recordId` – GUID of the record to run the action on
 * - `quickAction` – display name of the quick action (e.g. `Assign to Me`)
 * - `quickActionId` – GUID of the quick action definition
 * - `promptMode` – Manual (field/value rows) or JSON (complete prompt array)
 * - `manualPrompts` – Manual: field/value rows, each built into a PromptData entry
 * - `promptParams` – JSON: complete prompt entries
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
	{
		displayName: 'Prompt Mode',
		name: 'promptMode',
		type: 'options',
		noDataExpression: true,
		default: 'manual',
		options: [
			{
				name: 'Manual',
				value: 'manual',
				description: 'Add a Field Name and Value per prompt; the node builds each prompt entry for the record',
			},
			{
				name: 'JSON',
				value: 'json',
				description: 'Write the complete prompt array, for actions whose prompts need action metadata or hidden entries',
			},
		],
		description: 'How the answers to the quick action prompts are given',
	},
	{
		displayName: 'Prompts',
		name: 'manualPrompts',
		type: 'fixedCollection',
		placeholder: 'Add Prompt',
		default: {},
		typeOptions: { multipleValues: true },
		description: 'Answers to the quick action prompts. Each one is sent as a DataLayer.PromptData entry for this record. Leave empty when the action has no prompts',
		displayOptions: { show: { promptMode: ['manual'] } },
		options: [
			{
				displayName: 'Prompt',
				name: 'prompt',
				values: [
					{
						displayName: 'Field Name',
						name: 'fieldName',
						type: 'string',
						default: '',
						placeholder: 'e.g. Status',
						description: 'Exact Ivanti FieldName of the prompt, not its display label',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						ignoreValidationDuringExecution: true,
						placeholder: 'e.g. Closed',
						description: 'Answer to supply as literal text or an expression for workflow data, numbers, booleans, or null',
					},
				],
			},
		],
	},
	{
		displayName: 'Prompt Parameters (JSON)',
		name: 'promptParams',
		type: 'json',
		default: '[]',
		displayOptions: { show: { promptMode: ['json'] } },
		description: 'Complete prompt array with FieldName, Value, action metadata, and hidden entries, sent as written',
		hint: 'Use {{ $json.promptParams }} for a workflow array, or switch to Expression to fill in values. Empty means no prompts',
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
			const objectType = toActualObjectType(businessObject);
			const prompts = getPromptParameters.call(this, i, { recordId, objectType });

			const quickActionPayload = {
				ActionId: quickActionId,
				ShouldSave: true,
				ActionParams: {
					GridParams: null,
					FormParams: {
						actionId: quickActionId,
						objectId: recordId,
						actualObjectType: objectType,
					}
				},
				...(prompts.length === 0 ? { promptParams: null } : { PromptParams: prompts }),
			}
			const response = await ivantiApiRequest.call(this, 'POST', baseUrl, {}, quickActionPayload, getOverrideHeaders.call(this, i));
			// A successful REST Quick Action can return HTTP 200/204 with no body.
			const responseData = response == null || (typeof response === 'string' && response.trim() === '')
				? {}
				: response as IDataObject;
			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(responseData),
				{ itemData: { item: i } },
			);
			returnData.push(...executionData);
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push(continueOnFailItem(error, i));
			} else {
				throw itemError.call(this, error, i);
			}
		}
	}




	return returnData;
}
