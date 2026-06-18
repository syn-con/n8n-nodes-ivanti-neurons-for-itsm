
import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
import { assertSafePathSegment, assertSafeRecordId, validateBusinessObject } from '../../common';


/**
 * UI property definitions for the **Relationship → Link** operation.
 *
 * Exposes:
 * - `businessObject` – plural OData entity name of the source record
 * - `relationship` – relationship name (e.g. `IncidentToChange`)
 * - `recordId` – GUID of the source record
 * - `targetRecordId` – GUID of the record to link to
 */
export const properties: INodeProperties[] = [
	{
		displayName: "Business Object",
		name: "businessObject",
		type: "string",
		default: "",
		noDataExpression: true,
		required: true,
		description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",
		placeholder: "Incidents",
	},
	{
		displayName: "Relationship",
		name: "relationship",
		type: "string",
		default: "",
		noDataExpression: true,
		required: true,
		description: "The relationship to link. e.g., 'IncidentToChange'. You can get the relationship name from the Ivanti Neurons Configuration workspace.",
	},
	{
		displayName: "Record ID",
		name: "recordId",
		type: "string",
		default: "",
		required: true,
		description: "The record ID to link. The Guid format is '07E1BD1BF5804E67B8E76B26FA6EF9A0'.",
	},
	{
		displayName: "Target Record ID",
		name: "targetRecordId",
		type: "string",
		default: "",
		required: true,
		description: "The target record ID to link to. The Guid format is '07E1BD1BF5804E67B8E76B26FA6EF9A0'.",
	},
]
const displayOptions = {
	show: {
		resource: ['relationship'],
		operation: ['link'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);



/**
 * Executes the **Relationship → Link** operation.
 *
 * Issues `PATCH /odata/businessobject/{object}('{recordId}')/{relationship}('{targetRecordId}')/$Ref`
 * to create an OData `$ref` association between two records.
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
			assertSafePathSegment.call(this, businessObject, 'Business Object');
			assertSafePathSegment.call(this, relationship, 'Relationship');
			assertSafeRecordId.call(this, recordId);
			assertSafeRecordId.call(this, targetRecordId);

			const url = `/odata/businessobject/${businessObject}('${encodeURIComponent(recordId)}')/${relationship}('${encodeURIComponent(targetRecordId)}')/$Ref`;
			const response = await ivantiApiRequest.call(this, 'PATCH', url, {}, undefined);

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

