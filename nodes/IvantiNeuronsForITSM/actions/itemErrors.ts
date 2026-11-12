import type { IDataObject, IExecuteFunctions, INodeExecutionData, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

/**
 * Builds the output item for an input item that failed while Continue On Fail
 * is on. It is paired to the input item, so later nodes can still use
 * `$('Node').item`, and carries the HTTP status code when Ivanti answered.
 *
 * The n8n error is also set as the item's `error`. With On Error set to
 * "Continue (using error output)", n8n sends an item to the error output when it
 * has an `error`, or when its json holds only `error`, `message` and `details`;
 * `httpCode` falls outside that list, so without it the item went to the
 * success output (#63).
 */
export function continueOnFailItem(error: unknown, itemIndex: number): INodeExecutionData {
	const json: IDataObject = {
		error: error instanceof Error ? error.message : String(error),
	};
	if (error instanceof NodeApiError && error.httpCode) {
		json.httpCode = error.httpCode;
	}
	const item: INodeExecutionData = { json, pairedItem: { item: itemIndex } };
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		item.error = error;
	}
	return item;
}

/**
 * Returns the error to throw for a failed input item, tagged with its index so
 * n8n shows which item failed. An existing `NodeApiError` or
 * `NodeOperationError` is kept (with its HTTP code and description); anything
 * else is wrapped in a `NodeApiError`.
 */
export function itemError(
	this: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		if (error.context.itemIndex === undefined) {
			error.context.itemIndex = itemIndex;
		}
		return error;
	}
	return new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
}
