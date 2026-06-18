# Finding 6: getRelated passes $select as the body argument instead of qs, so $select is silently ignored

| Field | Value |
|---|---|
| Category | Bugs / Correctness |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:137, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/transports/index.ts:36 |

## Problem

`ivantiApiRequest` has the parameter order `(method, endpoint, qs, body)`:

```ts
// transports/index.ts:31-37
export async function ivantiApiRequest(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined,
){
```

The **Relationship → Get Related** operation builds a `qs` object containing the `$select` projection, but then passes it into the **5th argument (the `body` slot)** while passing `undefined` into the **4th argument (the `qs` slot)**:

```ts
// getRelated.operation.ts:132-137
const qs: IDataObject = {};
if (select) {
	qs["$select"] = select;

}
const response = await ivantiApiRequest.call(this, 'GET', url, undefined, qs);
```

Inside `ivantiApiRequest`, the (now empty/undefined) `qs` slot is what gets attached to the query string, while the `$select` ends up in `options.body`:

```ts
// transports/index.ts:47-56
const options: IHttpRequestOptions = {
	method,
	qs,        // <- receives `undefined` here
	body,      // <- receives the { "$select": ... } object here
	url: `https://${tenant}${tenantPath}${endpoint}`,
	...
};
```

For a `GET`, the OData server reads `$select` only from the query string; a body on a GET is ignored. So the projection is never transmitted.

The argument order is correct in every other call site, confirming this one is swapped. For example:

```ts
// object/getMany.operation.ts:301  (qs in slot 4, body in slot 5)
const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery, {});

// object/getByRecId.operation.ts:88  (empty qs in slot 4, undefined body in slot 5)
const response = await ivantiApiRequest.call(this, 'GET', fullUrl, {}, undefined);
```

## Why it matters

The "Select Fields" UI option on the Relationship → Get Related operation is silently a no-op. Users who add fields under "Select Fields" expecting a trimmed projection get the full default field set back instead, with no error or warning. This is a correctness bug: the node returns different data than the configured parameters imply, and it can also return larger-than-expected payloads (more bandwidth/memory) since no projection is applied. Because it fails silently, it is easy to ship and hard to notice.

A secondary, contributing issue is the loose `ivantiApiRequest` signature: `qs` has a default (`= {}`) but `body` does not, so callers that want to pass only a `qs` are tempted to pad the call with an explicit `undefined`, which is exactly how the slots got swapped here.

## Resolution

### Step 1 — Fix the call site (primary fix)

File: `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts`

BEFORE (line 137):

```ts
const response = await ivantiApiRequest.call(this, 'GET', url, undefined, qs);
```

AFTER:

```ts
const response = await ivantiApiRequest.call(this, 'GET', url, qs);
```

Here `qs` (which holds `$select`) is passed in the correct 4th-argument slot, and the `body` argument is omitted. This requires Step 2 so that omitting `body` type-checks.

### Step 2 — Give `body` a default so it can be omitted (root-cause hardening)

File: `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/transports/index.ts`

BEFORE (lines 31-37):

```ts
export async function ivantiApiRequest(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined,
){
```

AFTER:

```ts
export async function ivantiApiRequest(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
){
```

This matches the existing convention already used by `ivantiApiRequestAllItemsWithLimit` (transports/index.ts:84) and `ivantiApiRequestAllItems` (transports/index.ts:124), both of which already declare `body: IDataObject | undefined = undefined`. After this change, callers that only need a `qs` can simply omit the body argument (as in Step 1) instead of padding with a misordered `undefined`.

Note: passing the fix as `...url, qs)` (Step 1) plus the default body (Step 2) is the minimal, lowest-risk change. The existing `undefined` body behavior is preserved because GET requests in this codebase already send `body: undefined` here and on the other GET call sites.

### Optional follow-up (not required for the fix)

Other call sites that still pass an explicit trailing `undefined` for the body (e.g. getByRecId.operation.ts:88, serviceReq/getSubscription.operation.ts:70, automation/update.operation.ts:93) are correct and do not need changes, but once `body` has a default they could drop the trailing `undefined` for consistency. Leave them as-is unless doing a broader cleanup.

## Verification

1. Build / typecheck the package to confirm both edits compile:
   - Run the project build (e.g. `npm run build`) or the linter (`npm run lint`). With `body` now defaulting to `undefined`, the 4-argument call `ivantiApiRequest.call(this, 'GET', url, qs)` must type-check with no errors.
2. Manual / behavioral check of the projection actually reaching the wire:
   - In `ivantiApiRequest`, the request is built with `qs` (transports/index.ts:48). Temporarily log `options.url` and `options.qs` (or use n8n's request logging / a proxy) and run the Relationship → Get Related operation with one or more "Select Fields" entries.
   - BEFORE the fix: `options.qs` is `undefined` and `$select` appears in `options.body`; the response contains all default fields.
   - AFTER the fix: `options.qs` contains `{ "$select": "Name,..." }`, the outgoing URL carries `?$select=...`, and the returned related records are limited to the selected fields.
3. Confirm the empty-select path still works: run with no "Select Fields" entries — `select` stays `''`, `qs` stays `{}`, and the request behaves exactly as before.

## Related findings

None.
