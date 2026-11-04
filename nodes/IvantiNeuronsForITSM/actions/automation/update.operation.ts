import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports';
import { continueOnFailItem, itemError } from '../itemErrors';
import { isValidIvantiGuid } from '../../common';

/**
 * UI property definitions for the **Automation → Report Transaction** operation.
 *
 * Exposes:
 * - `transactionId` – 32-character GUID of the automation transaction to update
 * - `status` – new status: `Queued`, `Completed`, `Failed` or `Aborted` from node
 *   version 1.2; `Pending`, `In Progress`, `Completed` or `Failed` before that
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
	//Status (node versions 1 and 1.1: kept unchanged for saved workflows)
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
		displayOptions: { show: { '@version': [{ _cnd: { lt: 1.2 } }] } },
	},
	//Status (node version 1.2 and later: the values Ivanti uses for automation transactions)
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		required: true,
		description: 'The status of the transaction',
		default: 'Completed',
		placeholder: '',
		options: [
			{ name: 'Aborted', value: 'Aborted' },
			{ name: 'Completed', value: 'Completed' },
			{ name: 'Failed', value: 'Failed' },
			{ name: 'Queued', value: 'Queued' },
		],
		displayOptions: { show: { '@version': [{ _cnd: { gte: 1.2 } }] } },
	},
	{
		displayName: 'Result',
		name: 'result',
		type: 'string',
		description: 'The payload of the transaction',
		default: '',
		placeholder: '',
	},
	{
		displayName: 'If Already Finished',
		name: 'ifAlreadyFinished',
		type: 'options',
		noDataExpression: true,
		default: 'error',
		description:
			'What to do when the transaction is already Completed, Failed or Aborted, for example after a retry or when another branch has reported it',
		options: [
			{
				name: 'Error',
				value: 'error',
				description: 'Fail the item',
			},
			{
				name: 'Skip',
				value: 'skip',
				description:
					'Return the transaction unchanged with "alreadyFinished": true and do not update it',
			},
		],
	},
]

/** Transaction states after which Ivanti no longer accepts a report. */
const FINISHED_STATES = ['Completed', 'Failed', 'Aborted'];

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
 * 2. Checking whether the transaction is already in a terminal state
 *    (`Completed`, `Failed`, or `Aborted`). Depending on "If Already Finished",
 *    the item fails (default) or the transaction is returned unchanged with
 *    `alreadyFinished: true` and no PUT is sent.
 * 3. Issuing a `PUT` with the new `Status`, `JobResult`, and a `ReturnPayload`
 *    containing the n8n execution URL for traceability.
 *
 * @throws {NodeOperationError} when `transactionId` is empty or not a valid 32-char GUID,
 *   or when the transaction is already in a terminal state
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];
	for (let i = 0; i < items.length; i++) {
		try {
			const status = this.getNodeParameter('status', i) as string;
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
			if (FINISHED_STATES.includes(transactionDetails['Status'] as string)) {
				const ifAlreadyFinished = this.getNodeParameter('ifAlreadyFinished', i, 'error') as string;
				if (ifAlreadyFinished === 'skip') {
					returnData.push(
						...this.helpers.constructExecutionMetaData(
							this.helpers.returnJsonArray({ ...transactionDetails, alreadyFinished: true }),
							{ itemData: { item: i } },
						),
					);
					continue;
				}
				throw new NodeOperationError(this.getNode(), 'The transaction is already completed or failed or aborted!', {
					itemIndex: i,
					description: `Its status is "${String(transactionDetails['Status'])}". Set "If Already Finished" to "Skip" to return it unchanged instead.`,
				});
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
				returnData.push(continueOnFailItem(error, i));
			} else {
				throw itemError.call(this, error, i);
			}
		}
	}

	return returnData;
}
