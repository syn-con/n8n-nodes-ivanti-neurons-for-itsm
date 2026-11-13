



import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type JsonObject,
} from 'n8n-workflow';



import { NodeApiError, NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

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
 * - `promptParams` – complete JSON prompt entries, sent as written
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
		displayName: 'Prompt Parameters (JSON)',
		name: 'promptParams',
		type: 'json',
		default: '[]',
		description: 'Complete prompt array with FieldName, Value, action metadata, and hidden entries, sent as written',
		hint: 'Use {{ $json.promptParams }} for a workflow array, or switch to Expression to fill in values. Empty means no prompts',
	},
	{
		displayName: 'Return Record',
		name: 'returnRecord',
		type: 'boolean',
		default: false,
		description: 'Whether to read the record after the action ran and output it, instead of the empty reply of the action',
	},
]
const displayOptions = {
	show: {
		resource: ['quickAction'],
		operation: ['run'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

/** The message of a refusal that carries no reason, e.g. `Ivanti API request failed (HTTP 500, ISM_5000)`. */
const REFUSAL_WITHOUT_REASON = /^Ivanti API request failed \(HTTP 5\d\d(, [^)]*)?\)$/;

/**
 * Ivanti refuses an action, e.g. for an invalid prompt value, with HTTP 500
 * `ISM_5000` and an empty message. Says which action and business object were
 * refused, and that Ivanti gave no reason; any other error is returned as is.
 */
function explainEmptyRefusal(error: unknown, quickAction: string, businessObject: string): unknown {
	if (error instanceof NodeApiError && REFUSAL_WITHOUT_REASON.test(error.message)) {
		error.message = `${error.message}: Ivanti refused the quick action "${quickAction}" on ${businessObject} without saying why. Check the prompt values and that the action applies to this record`;
	}
	return error;
}

/**
 * Return Record: reads the record after the action ran. A failure here is
 * reported as such, because the action itself has already run.
 */
async function readRecordAfterAction(
	this: IExecuteFunctions,
	businessObject: string,
	recordId: string,
	quickAction: string,
	headers: IDataObject,
): Promise<IDataObject> {
	try {
		const record = await ivantiApiRequest.call(
			this, 'GET', `/odata/businessobject/${businessObject}('${encodeURIComponent(recordId)}')`, {}, undefined, headers,
		);
		const data: IDataObject = record && typeof record === 'object' ? { ...(record as IDataObject) } : {};
		delete data['@odata.context'];
		return data;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		const message = `The quick action "${quickAction}" ran, but reading the record afterwards failed: ${reason}`;
		if (error instanceof NodeApiError) {
			// The constructor returns an existing NodeApiError as is, so its HTTP
			// code and description are kept; only the message is replaced.
			error.message = message;
			throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { message });
		}
		throw new NodeOperationError(this.getNode(), message);
	}
}

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
			const prompts = getPromptParameters.call(this, i);

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
			const headers = getOverrideHeaders.call(this, i);
			let response: unknown;
			try {
				response = await ivantiApiRequest.call(this, 'POST', baseUrl, {}, quickActionPayload, headers);
			} catch (error) {
				throw explainEmptyRefusal(error, quickAction, businessObject);
			}
			// A successful REST Quick Action can return HTTP 200/204 with no body.
			let responseData = response == null || (typeof response === 'string' && response.trim() === '')
				? {}
				: response as IDataObject;

			if (this.getNodeParameter('returnRecord', i, false) as boolean) {
				responseData = await readRecordAfterAction.call(this, businessObject, recordId, quickAction, headers);
			}
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
