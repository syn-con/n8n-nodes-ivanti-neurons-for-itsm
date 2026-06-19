import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { Ivanti } from './node.type';

import * as search from './search';
import * as businessobject from './object';
import * as attachment from './attachment'
import * as relationship from './relationship'
import * as serviceReq from './serviceReq'
import * as quickAction from './quickAction'
import * as automation from './automation'

/**
 * Central dispatcher for the `IvantiNeuronsForItsm` node.
 *
 * Reads the `resource` and `operation` node parameters, constructs a typed
 * `Ivanti` discriminated-union value, and delegates execution to the matching
 * operation module's `execute` function.
 *
 * All unexpected errors are re-wrapped as `NodeOperationError` so n8n can
 * display them cleanly in the UI.
 *
 * @returns A two-dimensional array of `INodeExecutionData` as required by
 *          `INodeType.execute` (outer array = output connections, inner = items).
 */
export async function router(this: IExecuteFunctions) {

	let returnData: INodeExecutionData[] = [];
	try {
		const resource = this.getNodeParameter<Ivanti>('resource', 0);
		const operation = this.getNodeParameter('operation', 0);
		const ivanti = {
			resource,
			operation,
		} as Ivanti;

		switch (ivanti.resource) {
			case 'search':
				returnData = await search[ivanti.operation].execute.call(this);
				break;
			case 'businessobject':
				returnData = await businessobject[ivanti.operation].execute.call(this);
				break;
			case 'attachment':
				returnData = await attachment[ivanti.operation].execute.call(this);
				break;
			case 'relationship':
				returnData = await relationship[ivanti.operation].execute.call(this);
				break;
			case 'serviceReq':
				returnData = await serviceReq[ivanti.operation].execute.call(this);
				break;
			case 'quickAction':
				returnData = await quickAction[ivanti.operation].execute.call(this);
				break;
			case 'automation':
				returnData = await automation[ivanti.operation].execute.call(this);
				break;
			default:
				throw new NodeOperationError(
					this.getNode(),
					`The resource "${(ivanti as Ivanti).resource}" is not implemented`,
				);
		}


	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error);
	}
	return [returnData];
}
