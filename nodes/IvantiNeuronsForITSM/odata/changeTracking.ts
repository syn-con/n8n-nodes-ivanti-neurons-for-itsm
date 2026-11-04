import type { IDataObject, INodeExecutionData, IPollFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from '../transports';
import { isValidIvantiGuid } from '../common';

/** Field Ivanti updates on every change of a record. */
const MODIFIED_FIELD = 'LastModDateTime';
/** Unique key used to order records that share the same modification time. */
const KEY_FIELD = 'RecId';

/** ISO 8601 date-time as Ivanti returns it, e.g. `2026-11-04T09:12:33.127Z`. */
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Position of the last record the trigger emitted, kept in the node's workflow
 * static data. Records are read in (`LastModDateTime`, `RecId`) order, so
 * everything after this position is new or changed since the previous poll.
 */
interface Bookmark {
	lastModDateTime: string;
	recId: string;
}

/**
 * Polls for records created or modified since the previous poll (polling
 * trigger version 1.2 and later).
 *
 * - **First activation**: stores the newest matching record (or the current
 *   time when there is none) as the bookmark and emits nothing.
 * - **Later polls**: reads on from the bookmark with two keyset queries, so
 *   records that share the bookmark's modification time are not lost:
 *   1. `LastModDateTime eq T and RecId gt R`, ordered by `RecId`
 *   2. `LastModDateTime gt T`, ordered by `LastModDateTime, RecId`
 *   The bookmark then moves to the last record emitted. With a Limit, the
 *   remaining records are emitted on the next polls.
 * - **Manual run** (testing in the editor): emits the most recently modified
 *   records and leaves the bookmark untouched.
 *
 * The user's `$filter` is kept and combined with the bookmark condition; the
 * user's `$orderby` is replaced, because the keyset order is required.
 */
export async function pollChangedRecords(
	this: IPollFunctions,
	endpoint: string,
	query: IDataObject,
): Promise<INodeExecutionData[][] | null> {
	const returnAll = this.getNodeParameter('returnAll', false) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', 50) as number);

	const base = withoutOption(query, '$orderby');
	ensureSelected(base, [KEY_FIELD, MODIFIED_FIELD]);
	// Take the user's filter out under one spelling, so "$Filter" in a JSON
	// query is not sent next to the trigger's own "$filter".
	const filterKey = Object.keys(base).find((k) => k.toLowerCase() === '$filter');
	const rawFilter = filterKey ? base[filterKey] : undefined;
	const userFilter = typeof rawFilter === 'string' ? rawFilter.trim() : '';
	if (filterKey) delete base[filterKey];
	if (userFilter) base.$filter = userFilter;
	const andUserFilter = (condition: string) => (userFilter ? `(${userFilter}) and (${condition})` : condition);

	if (this.getMode() === 'manual') {
		const records = await fetch.call(this, endpoint, { ...base, $orderby: `${MODIFIED_FIELD} desc,${KEY_FIELD} desc` }, limit);
		return records.length > 0 ? [this.helpers.returnJsonArray(records)] : null;
	}

	const staticData = this.getWorkflowStaticData('node');
	const stored = staticData.bookmark as Bookmark | undefined;

	if (!stored) {
		const newest = await fetch.call(this, endpoint, { ...base, $orderby: `${MODIFIED_FIELD} desc,${KEY_FIELD} desc` }, 1);
		staticData.bookmark =
			newest.length > 0
				? toBookmark.call(this, newest[0])
				: { lastModDateTime: new Date().toISOString(), recId: '' };
		return null;
	}

	const bookmark = checkBookmark.call(this, stored);
	const records: IDataObject[] = [];

	if (bookmark.recId !== '') {
		records.push(
			...(await fetch.call(
				this,
				endpoint,
				{
					...base,
					$filter: andUserFilter(
						`${MODIFIED_FIELD} eq ${bookmark.lastModDateTime} and ${KEY_FIELD} gt '${bookmark.recId}'`,
					),
					$orderby: `${KEY_FIELD} asc`,
				},
				limit,
			)),
		);
	}
	if (records.length < limit) {
		records.push(
			...(await fetch.call(
				this,
				endpoint,
				{
					...base,
					$filter: andUserFilter(`${MODIFIED_FIELD} gt ${bookmark.lastModDateTime}`),
					$orderby: `${MODIFIED_FIELD} asc,${KEY_FIELD} asc`,
				},
				limit - records.length,
			)),
		);
	}

	if (records.length === 0) return null;

	staticData.bookmark = toBookmark.call(this, records[records.length - 1]);
	return [this.helpers.returnJsonArray(records)];
}

async function fetch(
	this: IPollFunctions,
	endpoint: string,
	query: IDataObject,
	limit: number,
): Promise<IDataObject[]> {
	try {
		if (limit === Infinity) {
			return await ivantiApiRequestAllItems.call(this, 'GET', endpoint, { ...query });
		}
		return await ivantiApiRequestAllItemsWithLimit.call(this, 'GET', endpoint, { ...query }, undefined, limit);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/** Copies the query without the given option (matched without regard to case). */
function withoutOption(query: IDataObject, option: string): IDataObject {
	const copy: IDataObject = {};
	for (const [key, value] of Object.entries(query)) {
		if (key.toLowerCase() !== option) copy[key] = value;
	}
	return copy;
}

/** Adds fields to an explicit `$select` so the bookmark can be read from every record. */
function ensureSelected(query: IDataObject, fields: string[]): void {
	const key = Object.keys(query).find((k) => k.toLowerCase() === '$select');
	if (!key) return;
	const value = query[key];
	if (typeof value !== 'string' || value.trim() === '' || value.trim() === '*') return;
	const selected = value.split(',').map((f) => f.trim()).filter((f) => f !== '');
	for (const field of fields) {
		if (!selected.some((f) => f.toLowerCase() === field.toLowerCase())) selected.push(field);
	}
	query[key] = selected.join(',');
}

function toBookmark(this: IPollFunctions, record: IDataObject): Bookmark {
	return checkBookmark.call(this, {
		lastModDateTime: record[MODIFIED_FIELD] as string,
		recId: record[KEY_FIELD] as string,
	});
}

/** Refuses a bookmark that is not safe to place in an OData filter. */
function checkBookmark(this: IPollFunctions, bookmark: Partial<Bookmark>): Bookmark {
	const { lastModDateTime, recId } = bookmark;
	if (typeof lastModDateTime !== 'string' || !DATE_TIME_PATTERN.test(lastModDateTime)) {
		throw new NodeOperationError(
			this.getNode(),
			`The polled records have no usable "${MODIFIED_FIELD}" value`,
			{
				description: `Received: ${JSON.stringify(lastModDateTime)}. The trigger uses ${MODIFIED_FIELD} and ${KEY_FIELD} to emit only new or changed records.`,
			},
		);
	}
	if (typeof recId !== 'string' || (recId !== '' && !isValidIvantiGuid(recId))) {
		throw new NodeOperationError(this.getNode(), `The polled records have no usable "${KEY_FIELD}" value`, {
			description: `Received: ${JSON.stringify(recId)}`,
		});
	}
	return { lastModDateTime, recId };
}
