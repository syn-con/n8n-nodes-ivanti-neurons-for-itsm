
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
 * UI property definitions for the **Relationship → Unlink** operation.
 *
 * Exposes:
 * - `businessObject` – plural OData entity name of the source record
 * - `relationship` – relationship name (e.g. `IncidentToChange`)
 * - `recordId` – GUID of the source record
 * - `targetRecordId` – GUID of the record to unlink
 */
export const properties: INodeProperties[] = [
	{
		displayName: "Business Object",
		name: "businessObject",
		type: "string",
		default: "",
		required: true,
		description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",
		placeholder: "Incidents",
	},
	//record id
	{
		displayName: "Relationship",
		name: "relationship",
		type: "string",
		default: "",
		required: true,
		description: 'The relationship to link, e.g., \'IncidentToChange\'',
	},
	{
		displayName: "Record ID",
		name: "recordId",
		type: "string",
		default: "",
		required: true,
		description: 'The record ID to link, e.g., \'07E1BD1BF5804E67B8E76B26FA6EF9A0\'',
	},

	//target record id
	{
		displayName: "Target Record ID",
		name: "targetRecordId",
		type: "string",
		default: "",
		required: true,
		description: 'The target record ID to link to, e.g., \'07E1BD1BF5804E67B8E76B26FA6EF9A0\'',
	},
]
const displayOptions = {
	show: {
		resource: ['relationship'],
		operation: ['unlink'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);



/**
 * Executes the **Relationship → Unlink** operation.
 *
 * Issues `DELETE /odata/businessobject/{object}('{recordId}')/{relationship}('{targetRecordId}')/$Ref`
 * to remove an OData `$ref` association between two records.
 * Throws if the API response code is not `ISM_2000`.
 *
 * @throws {NodeOperationError} when `recordId` or `targetRecordId` are empty,
 *   or when the API returns a non-success code
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];


	for (let i = 0; i < items.length; i++) {
		try {
			const relationship = this.getNodeParameter('relationship', i) as string;
			const businessObject = this.getNodeParameter('businessObject', i) as string;

			validateBusinessObject.call(this, businessObject);


			const recordId = this.getNodeParameter('recordId', i) as string;

			const targetRecordId = this.getNodeParameter('targetRecordId', i) as string;


			if (recordId === '') {
				throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
			}
			if (targetRecordId === '') {
				throw new NodeOperationError(this.getNode(), 'The "Target Record ID" parameter is required!');
			}

			const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}('${targetRecordId}')/$Ref`;

			const response = await ivantiApiRequest.call(this, 'DELETE', url, {}, undefined);

			const responseData = response as IDataObject;


			if (response.code != "ISM_2000") {
				throw new NodeOperationError(this.getNode(), responseData.message as string);
			}


			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(responseData),
				{ itemData: { item: i } },
			);
			returnData.push(...executionData);

		}
		catch (error) {
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

