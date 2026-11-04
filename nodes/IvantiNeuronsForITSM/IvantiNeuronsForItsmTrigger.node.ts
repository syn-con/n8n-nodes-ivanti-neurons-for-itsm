import type {
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from './transports';
import { odataListProperties } from './odata/queryProperties';
import { buildODataQuery } from './odata/queryBuilder';
import { pollChangedRecords } from './odata/changeTracking';
import { validateBusinessObject } from './common';


/**
 * Polling trigger node for Ivanti Neurons for ITSM.
 *
 * ## How it works
 * On every poll it queries the Ivanti OData API for records of the selected
 * business object that match the configured query.
 *
 * - **Version 1.2 and later** emit only records created or modified since the
 *   previous poll. A bookmark (`LastModDateTime` + `RecId` of the last record
 *   emitted) is kept in the node's workflow static data. The first poll after
 *   activation only stores the starting point. See `odata/changeTracking.ts`.
 * - **Versions 1 and 1.1** emit every matching record on every poll; nothing
 *   is remembered between polls.
 *
 * ## Manual trigger (test mode)
 * When the node is tested manually in the editor it runs a single poll and
 * emits the records currently returned by the API (version 1.2: the most
 * recently modified ones), without reading or changing the bookmark.
 */
// Trigger nodes cannot be invoked as AI tools, so n8n's community review requires
// them to omit usableAsTool; this lint rule does not distinguish trigger nodes.
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class IvantiNeuronsForItsmTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ivanti Neurons for ITSM Polling Trigger',
		polling: true,
		name: 'ivantiNeuronsForItsmTrigger',
		icon: { light: 'file:../../icons/ivant-neurons-for-itsm.svg', dark: 'file:../../icons/ivant-neurons-for-itsm.dark.svg' },
		group: ['trigger'],
		version: [1, 1.1, 1.2],
		subtitle: '=Poll: {{$parameter["object"]}} every {{$parameter["pollInterval"]}} min',
		description: 'Polls Ivanti Neurons for ITSM on a configurable interval and emits new records.',
		defaults: {
			name: 'Ivanti Neurons for ITSM Polling Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
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
			{
				displayName:
					'Each poll emits only the records created or modified since the previous poll, read in order of LastModDateTime and RecId (any Order By is replaced). The first poll after activation only records the starting point and emits nothing. Testing the node in the editor shows the most recently modified records.',
				name: 'changeTrackingNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { '@version': [{ _cnd: { gte: 1.2 } }] } },
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
	 * From version 1.2, steps 3–4 are replaced by `pollChangedRecords`, which emits only
	 * records created or modified since the previous poll. Versions 1 and 1.1 do not
	 * deduplicate.
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

		// Version 1.2 emits only new or changed records; 1 and 1.1 keep emitting
		// every matching record on each poll.
		if (this.getNode().typeVersion >= 1.2) {
			return pollChangedRecords.call(this, `/odata/businessobject/${object}`, query);
		}

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
