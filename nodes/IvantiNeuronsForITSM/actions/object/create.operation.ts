import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import { updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
import { validateBusinessObject } from '../../common';

/**
 * UI property definitions for the **Business Object → Create** operation.
 *
 * Exposes:
 * - `object` – the plural OData entity name (e.g. `Incidents`)
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
		required: true,
		noDataExpression: false,
		description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",
	},

	//mode
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'manual',
		required: true,
		noDataExpression: true,
		description: 'The mode of the create',
		options: [
			{ name: 'Manual', value: 'manual' },
			{ name: 'JSON', value: 'json' },
		],
	},

	{
		displayName: 'Fields',
		name: 'fields',
		placeholder: 'Add Field',
		type: 'fixedCollection',
		default: [],
		noDataExpression: false,
		typeOptions: {
			multipleValues: true,
		},
		description: 'The fields to create the record with',
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
						description: 'The value of the field. For null values, use "null".',
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
		description: 'The JSON payload to create the record with',
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
		operation: ['create'],
	},
};
export const description = updateDisplayOptions(displayOptions, properties);



/**
 * Executes the **Business Object → Create** operation.
 *
 * POSTs a new record to `POST /odata/businessobject/{object}` for each input item.
 * In `manual` mode, field name/value pairs are assembled into the request body;
 * the string `"null"` is treated as a JSON `null`. In `json` mode the raw JSON
 * parameter is sent directly. The `@odata.context` key is stripped from the response.
 *
 * @throws {NodeOperationError} when `object` is empty or does not end with `s`
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

	const items = this.getInputData();

	const returnData: INodeExecutionData[] = [];


	for (let i = 0; i < items.length; i++) {
		try {

			const object = this.getNodeParameter('object', i) as string;
			validateBusinessObject.call(this, object);
			const baseUrl = `/odata/businessobject/${object}`;

			let body: IDataObject = {};

			if (this.getNodeParameter('mode', i) === 'manual') {
				const fields = this.getNodeParameter('fields.fields', i, []) as { name: string, value: string }[];
				for (const field of fields) {
					if (field.name === '' || field.value === '') {
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
				'POST',
				baseUrl,
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
