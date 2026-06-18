import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
import { isValidIvantiGuid } from '../../common';

/**
 * UI property definitions for the **Automation → Report Transaction** operation.
 *
 * Exposes:
 * - `transactionId` – 32-character GUID of the automation transaction to update
 * - `status` – new status (`Pending`, `In Progress`, `Completed`, `Failed`)
 * - `result` – optional result payload string
 */
export const properties: INodeProperties[] = [

	//Transaction ID
	{
		displayName: 'Transaction ID',
		name: 'transactionId',
		type: 'string',
		required: true,
		description: 'The ID of the transaction to update',
		default: '',
		placeholder: '',
	},
	//Status
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		required: true,
		description: 'The status of the transaction',
		default: 'Pending',
		placeholder: '',
		options: [
			{ name: 'Pending', value: 'Pending' },
			{ name: 'In Progress', value: 'In Progress' },
			{ name: 'Completed', value: 'Completed' },
			{ name: 'Failed', value: 'Failed' },
		],
	},
	{
		displayName: 'Result',
		name: 'result',
		type: 'string',
		description: 'The payload of the transaction',
		default: '',
		placeholder: '',
	},
]

const displayOptions = {
	show: {
		resource: ['automation'],
		operation: ['update'],
	},
};
export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Executes the **Automation → Report Transaction** operation.
 *
 * Reports the outcome of an Ivanti automation job back to the platform by:
 * 1. Fetching the current transaction record from `IVNT_Automation_Transactionss`.
 * 2. Validating that the transaction is not already in a terminal state
 *    (`Completed`, `Failed`, or `Aborted`).
 * 3. Issuing a `PUT` with the new `Status`, `JobResult`, and a `ReturnPayload`
 *    containing the n8n execution URL for traceability.
 *
 * @throws {NodeOperationError} when `transactionId` is empty or not a valid 32-char GUID,
 *   or when the transaction is already in a terminal state
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const status = this.getNodeParameter('status', 0) as string;
	const returnData: INodeExecutionData[] = [];
	for (let i = 0; i < items.length; i++) {
		try {
			const transactionId = this.getNodeParameter('transactionId', i) as string;
			if (transactionId === '') {
				throw new NodeOperationError(this.getNode(), 'The "Transaction ID" parameter is required!');
			}
			if (!isValidIvantiGuid(transactionId)) {
				throw new NodeOperationError(this.getNode(), 'The "Transaction ID" parameter is not a valid GUID!');
			}
			const url = `/odata/businessobject/IVNT_Automation_Transactionss('${transactionId}')`;
			const transactionDetails = await ivantiApiRequest.call(this, 'GET', url, {}, undefined) as IDataObject;

			if (transactionDetails['@odata.context']) {
				delete transactionDetails['@odata.context'];
			}
			if (transactionDetails['Status'] === 'Completed' || transactionDetails['Status'] === 'Failed' || transactionDetails['Status'] === 'Aborted') {
				throw new NodeOperationError(this.getNode(), 'The transaction is already completed or failed or aborted!');
			}
			const baseUrl = this.getInstanceBaseUrl();
			const executionUrl = `${baseUrl}/execution/${this.getExecutionId()}`;
			const result = this.getNodeParameter('result', i) as string;
			const body = {
				"Status": status,
				"JobResult": result,
				"ReturnPayload": JSON.stringify({
					"ExecutionUrl": executionUrl,
				}),
			} as IDataObject;
			const response = await ivantiApiRequest.call(this, 'PUT', url, {}, body);
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
			} else {
				throw new NodeOperationError(this.getNode(), error as Error);
			}
		}
	}

	return returnData;
}
