# Finding 11: Transport helpers have no return type, leaking `any` across the whole package

| Field | Value |
|---|---|
| Category | TypeScript Quality |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/transports/index.ts:31-37,64,153-158,188-193`, `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:24-48`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:234-237`, `nodes/IvantiNeuronsForITSM/actions/relationship/link.operation.ts:105-111`, `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:91-93`, `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts:115-140`, `nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts:93,111-112` |

## Problem
None of the transport functions declare an explicit return type. `this.helpers.httpRequestWithAuthentication` resolves to `Promise<any>` (it is only narrowed when a generic is supplied), so every transport helper that returns its result — or returns `response.body` — propagates `any` to its callers.

In `nodes/IvantiNeuronsForITSM/transports/index.ts:31-37,64` the single-request helper has no annotated return type and returns the untyped body:

```ts
export async function ivantiApiRequest(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined,
){
	// ...
	const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
	// ...
	return response.body;   // <- typed `any`
}
```

The connector copy at `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:24-48` has the identical problem and additionally returns the *full* response object (it never sets `returnFullResponse`, and returns the call result directly rather than `.body`):

```ts
export async function ivantiApiRequest(
	// ...
	body: IDataObject | undefined,
){
	// ...
	return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorAuthApi', options);
}
```

Because the return type is `any`, every downstream member access compiles with **zero checking** and the `as ...` casts at call sites are vacuous:

- `serviceReq/create.operation.ts:234-237` — `response.IsSuccess` / `response.Message` read off `any`:
  ```ts
  const response = await ivantiApiRequest.call(this, 'POST', '/rest/ServiceRequest/new', {}, body);
  if (!response) continue;
  if (response.IsSuccess === false) {
  	throw new NodeOperationError(this.getNode(), response.Message as string);
  }
  ```
- `relationship/link.operation.ts:105-111` — `response.code` read off `any` (the `as IDataObject` cast on the next line is pointless; `IDataObject` has no `code` member anyway):
  ```ts
  const response = await ivantiApiRequest.call(this, 'PATCH', url, {}, undefined);
  const responseData = response as IDataObject;
  if (response.code != "ISM_2000") {
  	throw new NodeOperationError(this.getNode(), responseData.message as string);
  }
  ```
- `search/savedsearch.operation.ts:91-93` — `response.value` passed straight into `returnJsonArray` with no cast at all:
  ```ts
  const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
  const executionData = this.helpers.constructExecutionMetaData(
  	this.helpers.returnJsonArray(response.value),
  ```
- `search/fulltextsearchinsingleobject.operation.ts:115-140` — `response.data` (`.length`, spread) and `response.totalRows` all read off `any`:
  ```ts
  const response = await ivantiApiRequest.call(this, 'POST', '/rest/search/fulltext', {}, body);
  if (!response?.data?.length) { break; }
  data.push(...response.data);
  if (response.data.length < MAX_LIMIT || data.length >= response.totalRows) { break; }
  ```
- `connector/automation/update.operation.ts:93,111-112` — same pattern; results cast `as IDataObject` after the fact.

The two collection helpers (`ivantiApiRequestAllItemsWithLimit`, `ivantiApiRequestAllItems`) do build a typed `IDataObject[]` internally, but they also lack an explicit return type, so the *return* is inferred rather than contractually pinned. They internally cast the `any` result `as SearchResponse` (`index.ts:95,129,135`), which is the only place that is even partially type-safe.

## Why it matters
- **Maintainability / correctness**: every property name on a transport response (`IsSuccess`, `Message`, `code`, `message`, `value`, `data`, `totalRows`, `@odata.context`, `Status`) is unchecked. A typo (`response.isSuccess`, `response.Data`) compiles cleanly and silently evaluates to `undefined`, turning a compile-time error into a runtime no-op (e.g. an error branch that never fires, or a paging loop that never terminates because `response.totalRows` is `undefined` and `data.length >= undefined` is always `false`).
- **Vacuous casts**: the `as IDataObject` / `as SearchResponse` casts give a false impression of safety while the underlying value is `any`. `IDataObject` does not even declare the members being read (`code`, `IsSuccess`), so the casts are actively misleading.
- **Lint surface**: this is the root cause of widespread unsafe-member-access patterns that `@typescript-eslint`'s `no-unsafe-*` rules are designed to catch, but `any` short-circuits them.

## Resolution
Add explicit return types to the transport helpers and define small, accurate response interfaces in `common.ts`, then consume them at the call sites.

### 1. Add response interfaces to `nodes/IvantiNeuronsForITSM/common.ts`
The file already exports `SearchResponse`. Add the result shapes used by the operations directly below it (after line 44):

```ts
/**
 * Result returned by `POST /rest/ServiceRequest/new`.
 */
export interface ServiceRequestResult extends IDataObject {
	IsSuccess?: boolean;
	Message?: string;
}

/**
 * Result returned by relationship link/unlink ($Ref) PATCH calls.
 */
export interface RelationshipResult extends IDataObject {
	code?: string;
	message?: string;
}

/**
 * Result returned by `POST /rest/search/fulltext` (single-object full-text search).
 */
export interface FulltextSearchResponse extends IDataObject {
	data: IDataObject[];
	totalRows: number;
}
```
(Each `extends IDataObject` so the values stay compatible with `returnJsonArray` / `constructExecutionMetaData`, which accept `IDataObject`.)

### 2. Make the single-request helper generic — `nodes/IvantiNeuronsForITSM/transports/index.ts`

BEFORE (`:31-37,64`):
```ts
export async function ivantiApiRequest(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined,
){
	// ...
	return response.body;
}
```

AFTER:
```ts
export async function ivantiApiRequest<T = IDataObject>(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined,
): Promise<T> {
	// ...
	return response.body as T;
}
```
The internal `response` is the full HTTP response (`returnFullResponse: true`); annotate that explicitly so `response.statusCode` / `response.body` are not `any` either:
```ts
const response = (await this.helpers.httpRequestWithAuthentication.call(
	this,
	'ivantiNeuronsForItsmApiKeyApi',
	options,
)) as IN8nHttpFullResponse;
```
Import `IN8nHttpFullResponse` from `n8n-workflow` at the top of the file.

### 3. Pin the collection helpers' return types — same file
The bodies already produce `IDataObject[]`; just annotate the signatures and drop the now-redundant `as SearchResponse` by passing the generic:

BEFORE (`:79-85,95`):
```ts
export async function ivantiApiRequestAllItemsWithLimit(
	this: ...,
	limit: number = 100,
) {
	// ...
	const response = await ivantiApiRequest.call(this, method, endpoint, qs, body) as SearchResponse;
```
AFTER:
```ts
export async function ivantiApiRequestAllItemsWithLimit(
	this: ...,
	limit: number = 100,
): Promise<IDataObject[]> {
	// ...
	const response = await ivantiApiRequest.call<..., SearchResponse>(this, method, endpoint, qs, body);
```
If the explicit `.call<...>` generic syntax is awkward with the `this`-typed signature, keep the existing pattern but make it a typed local instead of a cast:
```ts
const response: SearchResponse = await ivantiApiRequest.call(this, method, endpoint, qs, body);
```
Apply the identical `: Promise<IDataObject[]>` annotation to `ivantiApiRequestAllItems` (`:119-125`) and replace its two `as SearchResponse` casts (`:129,135`) the same way.

### 4. Type the connector helper — `nodes/IvantiNeuronsForItsmConnector/transports/index.ts`
This copy returns the *full* response object, not `.body`. Mirror the generic but return `IN8nHttpFullResponse` (or align it with the main node by adding `returnFullResponse` + returning `.body`). Minimal, behaviour-preserving fix (`:24-30,47-48`):

BEFORE:
```ts
export async function ivantiApiRequest(
	this: ...,
	body: IDataObject | undefined,
){
	// ...
	return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorAuthApi', options);
}
```
AFTER:
```ts
export async function ivantiApiRequest<T = IDataObject>(
	this: ...,
	body: IDataObject | undefined,
): Promise<T> {
	// ...
	return this.helpers.httpRequestWithAuthentication.call(
		this,
		'ivantiNeuronsForItsmConnectorAuthApi',
		options,
	) as Promise<T>;
}
```
Note: the connector helper does NOT set `returnFullResponse`, so its result is the parsed body (or string, since `json: false`). The generic default `IDataObject` matches how `automation/update.operation.ts:93,112` already casts it `as IDataObject`.

### 5. Update the call sites to supply the type and drop vacuous casts

`serviceReq/create.operation.ts:234` — import `ServiceRequestResult` from `'../../common'` and:
```ts
const response = await ivantiApiRequest.call<..., ServiceRequestResult>(
	this, 'POST', '/rest/ServiceRequest/new', {}, body,
);
if (!response) continue;
if (response.IsSuccess === false) {
	throw new NodeOperationError(this.getNode(), response.Message as string);
}
// response already extends IDataObject, so returnJsonArray(response) needs no cast
```
(If the `.call<...>` generic form is inconvenient, use a typed local: `const response: ServiceRequestResult = await ivantiApiRequest.call(...)`.)

`relationship/link.operation.ts:105-111` — type as `RelationshipResult` and remove the misleading `as IDataObject`:
```ts
const response: RelationshipResult = await ivantiApiRequest.call(this, 'PATCH', url, {}, undefined);
if (response.code !== 'ISM_2000') {
	throw new NodeOperationError(this.getNode(), response.message as string);
}
this.helpers.returnJsonArray(response);
```

`search/savedsearch.operation.ts:91` — type as `SearchResponse`:
```ts
const response: SearchResponse = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
// response.value is now IDataObject[]
this.helpers.returnJsonArray(response.value);
```

`search/fulltextsearchinsingleobject.operation.ts:115,132` — type as `FulltextSearchResponse`:
```ts
const response: FulltextSearchResponse = await ivantiApiRequest.call(this, 'POST', '/rest/search/fulltext', {}, body);
if (!response?.data?.length) { break; }
data.push(...response.data);
if (response.data.length < MAX_LIMIT || data.length >= response.totalRows) { break; }
```

`connector/automation/update.operation.ts:93,111` — the existing `as IDataObject` casts can stay (they now match the helper's default generic), or be replaced with the generic call form for consistency.

`search/fulltextsearchacrossallobjects.operation.ts:58` and other call sites that just forward the body into `returnJsonArray` need no change once the default generic is `IDataObject`.

## Verification
1. Build/typecheck the package — this is the primary verification, since the whole point is to surface previously-unchecked member access:
   - `npx n8n-node build` (preferred per AGENTS.md), or `npx tsc --noEmit`.
   - Confirm it compiles with the new explicit return types and that any genuinely-wrong member access (introduced or pre-existing) now errors.
2. Lint: `npx n8n-node lint` — verify no new `@typescript-eslint/no-unsafe-*` warnings appear at the changed call sites (they should now read typed members, not `any`).
3. Targeted manual check: temporarily introduce a typo such as `response.IsSucces` in `create.operation.ts` and confirm the typecheck now fails (it currently compiles). Revert afterward.
4. Confirm runtime behaviour is unchanged by exercising the Service Request create, Relationship link, Saved Search, and Full-Text-Search-in-single-object operations against a tenant (or mocked responses) — the typing changes are compile-time only and must not alter the request/response handling.

## Related findings
None.
