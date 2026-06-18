# Finding 39: transports/index.ts mixes credential reading, URL building, three request variants, two pagination algorithms, and error handling

| Field | Value |
|---|---|
| Category | SOLID (esp. Single Responsibility) |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/transports/index.ts:31-224`, `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:274-318` |

## Problem

`nodes/IvantiNeuronsForITSM/transports/index.ts` is a single ~220-line module that carries at least six independent reasons to change:

1. **Credential reading + base-URL construction, triplicated.** The exact same block appears verbatim in `ivantiApiRequest`, `ivantiApiRequestFormData`, and `ivantiApiRequestBinary`:

```ts
// transports/index.ts:40-46 (ivantiApiRequest) — identical at 159-165 and 195-204
const credential = await this.getCredentials('ivantiNeuronsForItsmApiKeyApi');
if (credential === undefined) {
	throw new Error('No credentials got returned!');
}
const tenant = (credential.tenant as string).replace(/^https?:\/\//, '').replace(/\/+$/, '');
const isOnPrem = credential.isOnPrem as boolean;
const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
```

2. **Three request variants** (`ivantiApiRequest`, `ivantiApiRequestFormData`, `ivantiApiRequestBinary`) each rebuild `IHttpRequestOptions` and call `httpRequestWithAuthentication` independently.

3. **Two distinct pagination algorithms** live beside the low-level request:
   - `ivantiApiRequestAllItemsWithLimit` (lines 79-105) — *accumulate-to-limit*: pages in `$top`/`$skip` batches until `returnData.length >= limit`.
   - `ivantiApiRequestAllItems` (lines 119-140) — *count-then-page*: issues a `$top=1` probe to read `@odata.count`, then loops to that count.

4. **Status/error handling exists only in `ivantiApiRequest`** (lines 59-62). `ivantiApiRequestFormData` and `ivantiApiRequestBinary` set neither `ignoreHttpStatusErrors` nor any error mapping, so error behavior is inconsistent across variants:

```ts
// transports/index.ts:59-62 — present ONLY here
if(response.statusCode < 200 || response.statusCode >= 300){
	const error = response.body as IVantiApiError;
	throw new NodeOperationError(this.getNode(), error.message.join(', '));
}
```

5. **The `IVantiApiError` interface** (lines 218-223) is defined in this transport module although it is purely an error-shape type.

Relatedly, `getMany.operation.ts` `execute()` (lines 274-318) colocates input validation, the `limit > 100` transport-selection branch (a magic-number business rule), `SearchResponse` unwrapping, and execution-metadata construction:

```ts
// getMany.operation.ts:291-305
if (returnAll) {
    const allRecords = await ivantiApiRequestAllItems.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery);
    records.push(...allRecords);
} else {
    const limit = this.getNodeParameter('limit', i) as number;
    if(limit > 100){
        const allRecords = await ivantiApiRequestAllItemsWithLimit.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery, undefined, limit);
        records.push(...allRecords);
    }else{
        odataQuery["$top"] = limit;
        const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery,{});
        const searchResponse : SearchResponse = response;
        records.push(...searchResponse.value);
    }
}
```

This `returnAll`/`limit`/`limit > 100` selection is duplicated in `searchByKeyword.operation.ts:170-185` and again in `IvantiNeuronsForItsmTrigger.node.ts:322-325` — three call-sites implementing the same fetch-strategy decision by hand.

## Why it matters

- **Maintainability / DRY:** The credential+URL block is copy-pasted three times. Any change (different on-prem path, added port, encoding fix, new credential field) must be made in three places, and the on-prem `/HEAT/api` rule is itself a separate finding about triplication.
- **Inconsistent error handling (latent runtime defect):** Only `ivantiApiRequest` maps non-2xx responses to a `NodeOperationError`. `ivantiApiRequestFormData` and `ivantiApiRequestBinary` do not set `ignoreHttpStatusErrors` and do no body-shape error mapping, so attachment upload/download failures surface differently (raw thrown HTTP error vs. friendly message) than every other operation. A single uniformly-applied error mapper removes that divergence.
- **Fragile fetch-strategy duplication:** The `limit > 100` rule and the `returnAll` branch are reimplemented at three call-sites. If the OData batch policy changes, all three must be edited in lockstep, and they can silently drift (e.g. `getMany` passes `body` as `{}` on the single-request path while `searchByKeyword` passes `undefined`).
- **Testability:** Pagination math, URL building, and error mapping cannot be unit-tested in isolation because they are entangled with `httpRequestWithAuthentication`.

## Resolution

The goal is to split the one module into cohesive units, each with a single reason to change, without altering external behavior. Suggested layout under `nodes/IvantiNeuronsForITSM/transports/`:

```
transports/
  options.ts      # credential reading + base-URL building (one source of truth)
  errors.ts       # IVantiApiError type + mapApiError()
  request.ts      # the three request variants, all sharing options.ts + errors.ts
  pagination.ts   # the two paging algorithms + fetchRecords() strategy helper
  index.ts        # re-exports, so existing imports keep working
```

### Step 1 — Extract base-URL + options building into `transports/options.ts`

Create `nodes/IvantiNeuronsForITSM/transports/options.ts`:

```ts
import type {
	IDataObject,
	IExecuteFunctions,
	IExecuteSingleFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	ITriggerFunctions,
} from 'n8n-workflow';

const CREDENTIAL_NAME = 'ivantiNeuronsForItsmApiKeyApi';

type RequestContext =
	| IExecuteFunctions
	| IExecuteSingleFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| ITriggerFunctions
	| IPollFunctions;

/**
 * Reads the Ivanti credential and builds the fully-qualified request URL for an
 * API path. Single source of truth for tenant normalization and the on-prem
 * `/HEAT/api` vs cloud `/api` prefix.
 */
export async function resolveBaseUrl(this: RequestContext, endpoint: string) {
	const credential = await this.getCredentials(CREDENTIAL_NAME);
	if (credential === undefined) {
		throw new Error('No credentials got returned!');
	}
	const tenant = (credential.tenant as string)
		.replace(/^https?:\/\//, '')
		.replace(/\/+$/, '');
	const tenantPath = (credential.isOnPrem as boolean) ? '/HEAT/api' : '/api';
	return {
		url: `https://${tenant}${tenantPath}${endpoint}`,
		skipSslCertificateValidation: credential.skipSslVerification as boolean,
	};
}

/**
 * Builds the IHttpRequestOptions shared by every request variant.
 */
export async function buildRequestOptions(
	this: RequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	overrides: Partial<IHttpRequestOptions> = {},
): Promise<IHttpRequestOptions> {
	const { url, skipSslCertificateValidation } = await resolveBaseUrl.call(this, endpoint);
	return {
		method,
		url,
		json: false,
		skipSslCertificateValidation,
		...overrides,
	};
}

export { CREDENTIAL_NAME };
export type { RequestContext };
```

### Step 2 — Move the error type and a single error mapper into `transports/errors.ts`

```ts
import { NodeOperationError, type IDataObject } from 'n8n-workflow';
import type { RequestContext } from './options';

export interface IVantiApiError {
	code: string;
	description: string;
	message: string[];
	help: string;
}

/**
 * Uniform non-2xx -> NodeOperationError mapping for every request variant.
 * Returns the body unchanged on success.
 */
export function mapApiError(
	this: RequestContext,
	response: { statusCode: number; body: unknown },
): IDataObject {
	if (response.statusCode < 200 || response.statusCode >= 300) {
		const error = response.body as IVantiApiError;
		const message = Array.isArray(error?.message)
			? error.message.join(', ')
			: `Request failed with status ${response.statusCode}`;
		throw new NodeOperationError(this.getNode(), message);
	}
	return response.body as IDataObject;
}
```

### Step 3 — Reduce the three request variants in `transports/request.ts` to use the shared helpers

Each variant now only declares what is unique to it; the credential/URL block is gone and the same error mapper is applied uniformly:

```ts
import type { IDataObject, IHttpRequestMethods } from 'n8n-workflow';
import { buildRequestOptions, CREDENTIAL_NAME, type RequestContext } from './options';
import { mapApiError } from './errors';

export async function ivantiApiRequest(
	this: RequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined,
) {
	const options = await buildRequestOptions.call(this, method, endpoint, {
		qs,
		body,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});
	const response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, options);
	return mapApiError.call(this, response);
}

export async function ivantiApiRequestFormData(
	this: RequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	formData: FormData,
) {
	const options = await buildRequestOptions.call(this, method, endpoint, {
		body: formData,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});
	const response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, options);
	return mapApiError.call(this, response); // now consistent with ivantiApiRequest
}

export async function ivantiApiRequestBinary(
	this: RequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
) {
	const options = await buildRequestOptions.call(this, method, endpoint, {
		body,
		returnFullResponse: true,
	});
	return this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, options);
}
```

Note: the binary variant intentionally keeps `returnFullResponse` and *omits* `mapApiError` because its callers (e.g. `readAttachment.operation.ts:63`) need the raw full response (headers + body stream). If you want consistent error mapping there too, callers must read `response.body` after mapping — verify against `readAttachment.operation.ts` before changing it.

### Step 4 — Move both paging algorithms into `transports/pagination.ts` and add a `fetchRecords` strategy helper

```ts
import type { IDataObject, IHttpRequestMethods } from 'n8n-workflow';
import { ivantiApiRequest } from './request';
import type { RequestContext } from './options';
import type { SearchResponse } from '../common';

/** Maximum number of records fetched in a single OData page request. */
export const ODATA_BATCH_SIZE = 100;

export async function ivantiApiRequestAllItemsWithLimit(
	this: RequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
	limit: number = 100,
) {
	const returnData: IDataObject[] = [];
	let skip = 0;
	while (returnData.length < limit) {
		qs['$top'] = Math.min(limit - returnData.length, ODATA_BATCH_SIZE);
		qs['$skip'] = skip;
		const response = (await ivantiApiRequest.call(this, method, endpoint, qs, body)) as SearchResponse;
		returnData.push(...response.value);
		skip += response.value.length;
		if (response.value.length < ODATA_BATCH_SIZE) break;
	}
	return returnData;
}

export async function ivantiApiRequestAllItems(
	this: RequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
) {
	const returnData: IDataObject[] = [];
	qs['$top'] = 1;
	const probe = (await ivantiApiRequest.call(this, method, endpoint, qs, body)) as SearchResponse;
	const count = probe['@odata.count'];
	qs['$top'] = ODATA_BATCH_SIZE;
	let skip = 0;
	while (returnData.length < count) {
		qs['$skip'] = skip;
		const response = (await ivantiApiRequest.call(this, method, endpoint, qs, body)) as SearchResponse;
		returnData.push(...response.value);
		skip += ODATA_BATCH_SIZE;
	}
	return returnData;
}

/**
 * Single decision point for the returnAll / limit / >batch-size fetch strategy
 * that is currently re-implemented in getMany, searchByKeyword and the trigger.
 */
export async function fetchRecords(
	this: RequestContext,
	endpoint: string,
	qs: IDataObject,
	options: { returnAll: boolean; limit?: number },
): Promise<IDataObject[]> {
	if (options.returnAll) {
		return ivantiApiRequestAllItems.call(this, 'GET', endpoint, qs);
	}
	const limit = options.limit ?? 100;
	if (limit > ODATA_BATCH_SIZE) {
		return ivantiApiRequestAllItemsWithLimit.call(this, 'GET', endpoint, qs, undefined, limit);
	}
	qs['$top'] = limit;
	const response = (await ivantiApiRequest.call(this, 'GET', endpoint, qs, {})) as SearchResponse;
	return response.value;
}
```

### Step 5 — Re-export everything from `transports/index.ts` so existing imports keep compiling

```ts
export { ivantiApiRequest, ivantiApiRequestFormData, ivantiApiRequestBinary } from './request';
export {
	ivantiApiRequestAllItems,
	ivantiApiRequestAllItemsWithLimit,
	fetchRecords,
	ODATA_BATCH_SIZE,
} from './pagination';
export { resolveBaseUrl, buildRequestOptions } from './options';
export { mapApiError, type IVantiApiError } from './errors';
```

All current importers (`getMany.operation.ts:12`, `searchByKeyword.operation.ts:10`, `IvantiNeuronsForItsmTrigger.node.ts:11`, `listSearch.ts:3`, `serviceReq/*`, `attachment/*`) import from `'../../transports'` / `'./transports'`, so the barrel file keeps them working with zero churn.

### Step 6 — Collapse the magic-number branch in `getMany.operation.ts` `execute()`

BEFORE (`getMany.operation.ts:291-305`):

```ts
if (returnAll) {
    const allRecords = await ivantiApiRequestAllItems.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery);
    records.push(...allRecords);
} else {
    const limit = this.getNodeParameter('limit', i) as number;
    if(limit > 100){
        const allRecords = await ivantiApiRequestAllItemsWithLimit.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery, undefined, limit);
        records.push(...allRecords);
    }else{
        odataQuery["$top"] = limit;
        const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery,{});
        const searchResponse : SearchResponse = response;
        records.push(...searchResponse.value);
    }
}
```

AFTER:

```ts
const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
const allRecords = await fetchRecords.call(
    this,
    `/odata/businessobject/${object}`,
    odataQuery,
    { returnAll, limit },
);
records.push(...allRecords);
```

Update the import at line 12 to `import { fetchRecords } from '../../transports'` (the `SearchResponse` import for this branch is no longer needed in `execute`). Apply the same substitution at `searchByKeyword.operation.ts:170-185` and at `IvantiNeuronsForItsmTrigger.node.ts:322-325` so the three call-sites share the one strategy helper.

### Notes / caveats

- Preserve current behavior exactly: `getMany` passes `body: {}` on the single-request path while `searchByKeyword` passes `undefined`. The `fetchRecords` helper above standardizes on `{}` — confirm the Ivanti API treats a GET with `{}` body identically (it does today since `ivantiApiRequest` was already called both ways) before relying on it.
- This is a pure refactor: no public function names change, so no `package.json` `n8n.nodes`/`n8n.credentials` updates and no version bump are required unless you choose to release it (in which case update `CHANGELOG.md` per AGENTS.md).

## Verification

1. Build/typecheck and lint with the project tooling (per AGENTS.md, prefer the `n8n-node` CLI):
   - `npx n8n-node lint` (or the repo's configured lint script) — must pass with no new warnings.
   - `npm run build` / `tsc --noEmit` — must compile; the barrel re-exports in `index.ts` guarantee existing imports resolve.
2. Grep to confirm no leftover duplication:
   - `grep -rn "credential.tenant" nodes/` should now match only `transports/options.ts` (one occurrence), down from three.
   - `grep -rn "> 100" nodes/IvantiNeuronsForITSM/actions nodes/IvantiNeuronsForITSM/*.ts` should no longer match the fetch-strategy branches in `getMany`, `searchByKeyword`, and the trigger.
3. Functional smoke test in n8n dev mode (`npx n8n-node dev`): run **Business Object → Get Many** with (a) `returnAll = true`, (b) `limit = 50` (single-request path), and (c) `limit = 250` (multi-page path) and confirm record counts match pre-refactor output. Repeat for **Search by Keyword** and the polling trigger.
4. Confirm the error-handling unification: trigger a 4xx from an attachment upload/download and verify it now surfaces as a `NodeOperationError` consistent with other operations (only if you opted to apply `mapApiError` to the form-data/binary variants in Step 3).

## Related findings

- The tenant-URL construction triplication is its own dedicated finding referenced in the canonical summary ("see the tenant-URL finding"); Step 1 here is the shared fix for both. Cross-reference that finding number when applying.
- The duplicated `returnAll`/`limit > 100` fetch-strategy logic in `searchByKeyword.operation.ts:170-185` and `IvantiNeuronsForItsmTrigger.node.ts:322-325` is resolved by the same `fetchRecords` helper (Step 4/6); if those have separate finding numbers, link them.
