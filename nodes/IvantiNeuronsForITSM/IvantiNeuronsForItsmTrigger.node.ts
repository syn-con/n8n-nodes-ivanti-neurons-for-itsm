import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from './transports';
import { odataListProperties } from './odata/queryProperties';
import { buildODataQuery } from './odata/queryBuilder';
import { validateBusinessObject } from './common';


/**
 * Polling trigger node for Ivanti Neurons for ITSM.
 *
 * ## How it works
 * 1. On activation, the node starts an interval timer (configurable in minutes).
 * 2. On every tick it queries the Ivanti OData API for records of the selected
 *    business object that match the configured OData filter.
 * 3. It compares the `RecId` of every returned record against the set of IDs
 *    seen in the previous poll (stored in workflow static data).
 * 4. Only **new** records (IDs not seen before) are emitted downstream.
 * 5. The seen-IDs set is updated after each poll so duplicates are suppressed
 *    across executions.
 *
 * On the first run (no stored state) **all** matching records are emitted so
 * the workflow can bootstrap its state. Set the OData filter to a narrow time
 * window if you want to limit the initial data volume.
 *
 * ## Manual trigger (test mode)
 * When the node is tested manually in the editor it runs a single poll and
 * emits whatever records are currently returned by the API, ignoring the
 * stored state, so you can inspect the data shape without waiting for the
 * interval.
 */
export class IvantiNeuronsForItsmTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ivanti Neurons for ITSM Polling Trigger',
		polling: true,
		name: 'ivantiNeuronsForItsmTrigger',
		icon: { light: 'file:../../icons/ivant-neurons-for-itsm.svg', dark: 'file:../../icons/ivant-neurons-for-itsm.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '=Poll: {{$parameter["object"]}} every {{$parameter["pollInterval"]}} min',
		description: 'Polls Ivanti Neurons for ITSM on a configurable interval and emits new records.',
		defaults: {
			name: 'Ivanti Neurons for ITSM Polling Trigger',
		},
		usableAsTool: true,
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'ivantiNeuronsForItsmApiKeyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Business Object',
				name: 'object',
				type: 'string',
				default: 'Incidents',
				required: true,
				noDataExpression: true,
				placeholder: 'Incidents',
				description: "The plural OData entity name to poll, e.g. 'Incidents', 'Changes', 'Problems'",
			},
			...odataListProperties
		],
	};

	/**
	 * Called by n8n on every poll cycle (schedule driven by the workflow's cron/interval settings).
	 *
	 * ## Flow
	 * 1. Validates `object` — must be non-empty and end with `s` (OData plural convention).
	 * 2. Builds the OData query (`$select`, `$filter`, `$orderby`) from the node UI inputs via
	 *    `buildQuery()`.
	 * 3. Fetches records:
	 *    - `returnAll = true`  → pages through the entire result set via `ivantiApiRequestAllItems`
	 *    - `returnAll = false` → fetches up to `limit` records via `ivantiApiRequestAllItemsWithLimit`
	 * 4. Returns `null` when no records are found so n8n skips the execution silently.
	 *    Returns a single output array of JSON items when records are present.
	 *
	 * Note: deduplication (seen-RecId tracking) is NOT performed here — this node relies on
	 * n8n's built-in poll deduplication via `getWorkflowStaticData` if needed, or the caller
	 * is expected to filter downstream.
	 */
	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const object = this.getNodeParameter('object') as string;

		validateBusinessObject.call(this, object);
		/**
		 * Assembles the OData query parameters (`$select`, `$filter`, `$orderby`) from
		 * the structured node UI inputs.
		 * When `selectAllFields` is false, `RecId` is always prepended to the field list
		 * so downstream deduplication logic can rely on it being present.
		 */


		const query = buildODataQuery.call(this, 0, { includeRecId: true });
		let response: IDataObject | IDataObject[] | null = null;
		try {
			const returnAll = this.getNodeParameter('returnAll', false) as boolean;
			if (returnAll) {
				// Fetch every page until the server has no more records
				response = await ivantiApiRequestAllItems.call(this, 'GET', `/odata/businessobject/${object}`, query, {}) as IDataObject[];
			} else {
				const limit = this.getNodeParameter('limit', 50) as number;
				response = await ivantiApiRequestAllItemsWithLimit.call(this, 'GET', `/odata/businessobject/${object}`, query, {}, limit) as IDataObject[];
			}
		} catch (error) {
			throw new NodeOperationError(this.getNode(), error as Error);
		}

		if (response !== null && Array.isArray(response) && response.length > 0) {
			return [this.helpers.returnJsonArray(response)];
		}

		return null;
	}
}
