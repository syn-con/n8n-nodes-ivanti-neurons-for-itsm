
import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
import { assertSafeFieldName, assertSafePathSegment, assertSafeRecordId, validateBusinessObject } from '../../common';


/**
 * UI property definitions for the **Relationship → Get Related** operation.
 *
 * Exposes:
 * - `businessObject` – plural OData entity name of the source record
 * - `recordId` – GUID of the source record
 * - `relationship` – relationship name to traverse (e.g. `IncidentToChange`)
 * - `selectFields` – optional field projection for the related records
 * - `includeInputFields` – when true, merges related records into the input item
 *   under a key named after the relationship, instead of emitting separate items
 */
export const properties: INodeProperties[] = [
	{
		displayName: "Business Object",
		name: "businessObject",
		type: "string",
		default: "",
		required: true,
		noDataExpression: true,
		description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",
		placeholder: "Incidents",
	},
	//record id
	{
		displayName: "Record ID",
		name: "recordId",
		type: "string",
		default: "",
		required: true,
		description: "The record ID to link. The Guid format is '07E1BD1BF5804E67B8E76B26FA6EF9A0'.",
	},
	{
		displayName: "Relationship",
		name: "relationship",
		type: "string",
		default: "",
		required: true,
		description: "The relationship to link. e.g., 'IncidentToChange'.",
	},
	{
		displayName: 'Select Fields',
		name: 'selectFields',
		placeholder: 'Add Select Field',
		type: 'fixedCollection',
		default: [],
		typeOptions: {
			multipleValues: true,
		},
		description: 'The fields to select from the relationship. e.g., "Name".',
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
				],
			},
		],
	},
	//include input fields
	{
		displayName: 'Include Input Fields',
		name: 'includeInputFields',
		type: 'boolean',
		default: false,
		description: 'Whether to include the input fields in the response. If true, the input fields will be included in the response.',
	},

]
const displayOptions = {
	show: {
		resource: ['relationship'],
		operation: ['getRelated'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);



/**
 * Executes the **Relationship → Get Related** operation.
 *
 * Issues `GET /odata/businessobject/{object}('{recordId}')/{relationship}` and
 * returns the related records. When the API responds with "No instances found."
 * the result is normalised to an empty array rather than throwing.
 *
 * When `includeInputFields` is `true`, each output item merges the input item's
 * JSON with a `{relationship}: [...]` key instead of emitting one item per related record.
 *
 * @throws {NodeOperationError} when `recordId` is empty
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];
	for (let i = 0; i < items.length; i++) {
		try {
			const recordId = this.getNodeParameter('recordId', i) as string;
			if (recordId === '') {
				throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
			}
			const relationship = this.getNodeParameter('relationship', i) as string;
			const businessObject = this.getNodeParameter('businessObject', i) as string;

			validateBusinessObject.call(this, businessObject);

			const selectFieldsCollection = this.getNodeParameter('selectFields.fields', i, []) as { name: string }[];
			let select = '';
			if (selectFieldsCollection.length !== 0) {
				selectFieldsCollection.forEach(field => assertSafeFieldName.call(this, field.name));
				select += selectFieldsCollection.map(field => field.name).join(',');
			}



			assertSafePathSegment.call(this, businessObject, 'Business Object');
			assertSafePathSegment.call(this, relationship, 'Relationship');
			assertSafeRecordId.call(this, recordId);
			const includeInputFields = this.getNodeParameter('includeInputFields', i) as boolean;
			const url = `/odata/businessobject/${businessObject}('${encodeURIComponent(recordId)}')/${relationship}`;
			const qs: IDataObject = {};
			if (select) {
				qs["$select"] = select;

			}
			const response = await ivantiApiRequest.call(this, 'GET', url, qs);
			let responseData: GetRelatedResponse;
			if (typeof response.value === 'string' && response.value.includes('No instances found.')) {
				responseData = {
					"@odata.context": "",
					value: [],
				};
			} else {
				responseData = response as GetRelatedResponse;
			}
			let executionData: INodeExecutionData[] = [];
			if (includeInputFields) {
				executionData.push(
					{
						json: {
							...items[i].json,
							[`${relationship}`]: responseData.value,
						}
					}
				)
			} else {
				executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData.value),
					{ itemData: { item: i } },
				);
			}
			returnData.push(...executionData);
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: { error: (error as Error).message } });
			}
			else {
				throw error;
			}
		}
	}
	return returnData;
}



/** Shape of the OData response returned by relationship traversal endpoints. */
export interface GetRelatedResponse {
	"@odata.context": string
	value: IDataObject[]
}
