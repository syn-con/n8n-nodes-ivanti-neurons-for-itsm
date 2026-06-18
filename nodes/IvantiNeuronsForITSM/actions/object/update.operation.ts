import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
import { validateBusinessObject } from '../../common';

/**
 * UI property definitions for the **Business Object → Update** operation.
 *
 * Exposes:
 * - `object` – plural OData entity name (e.g. `Incidents`)
 * - `recordId` – GUID of the record to update
 * - `mode` – `manual` (key/value pairs) or `json` (raw JSON body)
 * - `fields` – key/value collection shown in manual mode
 * - `json` – raw JSON input shown in JSON mode
 */
export const properties: INodeProperties[] = [

	{
		displayName: "Business Object",
		name: "object",
		type: "string",
		default: "",
		noDataExpression: true,
		required: true,
		description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",

	},

	//Record ID
	{
		displayName: 'Record ID',
		name: 'recordId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the record to update. The Guid format is "07E1BD1BF5804E67B8E76B26FA6EF9A0".',
	},

	//Mode
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'manual',
		required: true,
		noDataExpression: true,
		description: 'The mode of the update. Manual or JSON.',
		options: [
			{ name: 'Manual', value: 'manual' },
			{ name: 'JSON', value: 'json' },
		],
	},

	//Fields
	{
		displayName: 'Fields',
		name: 'fields',
		placeholder: 'Add Field',
		type: 'fixedCollection',
		default: [],
		noDataExpression: true,
		typeOptions: {
			multipleValues: true,
		},
		description: 'The fields to update the record with. For null values, use "null".',
		options: [
			{
				name: 'fields',
				displayName: 'Field',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: 'Name',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					}
				],
			},
		],
		displayOptions: {
			show: {
				mode: ['manual'],
			},
		},
	},
	//JSON
	{
		displayName: 'JSON',
		name: 'json',
		type: 'json',
		default: '',
		required: true,
		description: 'The JSON payload to update the record with. Should be the fields to update the record with.',
		displayOptions: {
			show: {
				mode: ['json'],
			},
		},
	},

]




const displayOptions = {
	show: {
		resource: ['businessobject'],
		operation: ['update'],
	},
};
export const description = updateDisplayOptions(displayOptions, properties);



/**
 * Executes the **Business Object → Update** operation.
 *
 * Issues a `PUT /odata/businessobject/{object}('{recordId}')` for each input item.
 * In `manual` mode, field pairs are assembled into the body (empty values are skipped;
 * `"null"` is coerced to JSON `null`). In `json` mode the raw JSON parameter is sent.
 * The `@odata.context` key is stripped from the response.
 *
 * @throws {NodeOperationError} when `object` is empty or does not end with `s`,
 *   or when `recordId` is empty
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

	const items = this.getInputData();

	const returnData: INodeExecutionData[] = [];



	for (let i = 0; i < items.length; i++) {
		try {
			const object = this.getNodeParameter('object', i) as string;

			validateBusinessObject.call(this, object);
			const baseUrl = `/odata/businessobject/${object}`;

			const recordId = this.getNodeParameter('recordId', i) as string;
			if (recordId === '') {
				throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
			}
			const fullUrl = `${baseUrl}('${recordId}')`;
			let body: IDataObject = {};
			const fields = this.getNodeParameter('fields.fields', i, []) as { name: string, value: string }[];
			if (this.getNodeParameter('mode', i) === 'manual') {
				for (const field of fields) {
					if (field.value === '') {
						continue;
					}
					if (field.value === "null") {
						body[field.name] = null;
						continue;
					}
					body[field.name] = field.value;
				}
			} else if (this.getNodeParameter('mode', i) === 'json') {
				body = this.getNodeParameter('json', i) as IDataObject;
			}
			const response = await ivantiApiRequest.call(this,
				'PUT',
				fullUrl,
				{},
				body,
			);
			const responseData = response as IDataObject;
			if (responseData['@odata.context']) {
				delete responseData['@odata.context'];
			}
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
