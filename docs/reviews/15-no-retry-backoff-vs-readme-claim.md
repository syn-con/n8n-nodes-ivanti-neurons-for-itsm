# Finding 15: No retry/backoff on 429/5xx although README documents exponential backoff as a feature

| Field | Value |
|---|---|
| Category | Production Readiness |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/transports/index.ts:31-65` (single-shot request + throw at :59-62); `README.md:42` ("Comprehensive Error Handling" feature); `README.md:1407` ("Implement exponential backoff on 429 errors") |

## Problem

The README advertises error-handling/backoff behavior that the code does not implement.

`README.md:42` (Features list):

```
- **Comprehensive Error Handling**: Detailed error messages and validation
```

`README.md:1398-1409` (Rate Limits section):

```
### Rate Limits
...
**Typical Limits**:
- Cloud: 100 requests/minute per API key
- On-Premises: Configurable, typically 500 requests/minute

**Best Practices**:
- Implement exponential backoff on 429 errors
- Cache results when appropriate
- Batch operations when possible
```

But the actual transport makes exactly one request and throws on any non-2xx status, with no retry, no backoff, and no `Retry-After` handling (`nodes/IvantiNeuronsForITSM/transports/index.ts:58-62`):

```ts
const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
if(response.statusCode < 200 || response.statusCode >= 300){
	const error = response.body as IVantiApiError;
	throw new NodeOperationError(this.getNode(), error.message.join(', '));
}
```

A repo-wide search confirms there is no retry/backoff anywhere in `nodes/`:

```
$ grep -rn "retry\|backoff\|429\|Retry-After\|sleep\|setTimeout" nodes/
(no output)
```

Note: the canonical finding cited `README.md:1408` for the "Comprehensive Error Handling" claim; in the current file that bullet is at `README.md:42`, and `README.md:1407` is the "Implement exponential backoff on 429 errors" line. The substance of the finding is fully confirmed; only the line numbers differ slightly.

## Why it matters

- **Lost work mid-pagination.** `ivantiApiRequestAllItems` (transports/index.ts:119-140) and `ivantiApiRequestAllItemsWithLimit` (transports/index.ts:79-105) page through OData result sets one batch at a time, each via `ivantiApiRequest`. A single `429` (the documented cloud limit is 100 req/min) on any page throws immediately and discards every record already accumulated in `returnData`. The larger the result set, the more likely a 429 and the more work lost.
- **No tolerance for transient 5xx.** Transient `502/503/504` from the Ivanti gateway abort the operation even though a retry a second later would succeed.
- **Docs/behavior mismatch.** The README explicitly tells users the node implements exponential backoff on 429 and "Comprehensive Error Handling." It does neither. For a community node intended for n8n Cloud submission, advertised behavior that doesn't exist is a correctness and trust problem.

## Resolution

Two acceptable paths. **Option A (recommended)** implements retry-with-backoff in the shared transport so all callers benefit. **Option B** removes the unmet claims from the README. Do A *or* B; A is preferred because it makes the documented behavior true.

### Option A — Implement retry with capped exponential backoff + jitter + `Retry-After`

All request helpers already share `ivantiApiRequest`. Add a small retry helper and route the JSON request through it. Because `ignoreHttpStatusErrors: true` is already set, the wrapper sees the full response (status + headers) and can decide whether to retry before throwing.

**File: `nodes/IvantiNeuronsForITSM/transports/index.ts`**

Add a sleep helper and retry config near the top (after `ODATA_BATCH_SIZE`):

```ts
/** Maximum number of records fetched in a single OData page request. */
const ODATA_BATCH_SIZE = 100;

/** HTTP statuses that are safe to retry (rate limit + transient gateway errors). */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
/** Maximum number of attempts (1 initial + N-1 retries). */
const MAX_ATTEMPTS = 4;
/** Base delay in ms for exponential backoff. */
const BASE_DELAY_MS = 500;
/** Hard cap on a single backoff wait, in ms. */
const MAX_DELAY_MS = 30_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Computes the backoff delay for a given attempt. Honors a server-provided
 * `Retry-After` header (seconds or HTTP-date) when present; otherwise uses
 * capped exponential backoff with full jitter.
 */
function computeBackoffMs(attempt: number, retryAfter?: string | number): number {
	if (retryAfter !== undefined) {
		const asNumber = Number(retryAfter);
		if (!Number.isNaN(asNumber)) {
			return Math.min(asNumber * 1000, MAX_DELAY_MS);
		}
		const asDate = Date.parse(String(retryAfter));
		if (!Number.isNaN(asDate)) {
			return Math.min(Math.max(asDate - Date.now(), 0), MAX_DELAY_MS);
		}
	}
	const expDelay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
	// Full jitter to avoid thundering-herd retries.
	return Math.floor(Math.random() * expDelay);
}
```

Then change the request body of `ivantiApiRequest` (transports/index.ts:57-64).

BEFORE:

```ts
	const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
	if(response.statusCode < 200 || response.statusCode >= 300){
		const error = response.body as IVantiApiError;
		throw new NodeOperationError(this.getNode(), error.message.join(', '));
	}

	return response.body;
}
```

AFTER:

```ts
	let response;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			'ivantiNeuronsForItsmApiKeyApi',
			options,
		);

		if (response.statusCode >= 200 && response.statusCode < 300) {
			return response.body;
		}

		const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
		if (RETRYABLE_STATUS.has(response.statusCode) && !isLastAttempt) {
			const retryAfter =
				(response.headers?.['retry-after'] as string | undefined) ??
				(response.headers?.['Retry-After'] as string | undefined);
			await sleep(computeBackoffMs(attempt, retryAfter));
			continue;
		}

		break;
	}

	const error = response!.body as IVantiApiError;
	const message = Array.isArray(error?.message)
		? error.message.join(', ')
		: `Ivanti API request failed with status ${response!.statusCode}`;
	throw new NodeOperationError(this.getNode(), message);
}
```

Notes on accuracy to this repo:
- `options` already sets `returnFullResponse: true` and `ignoreHttpStatusErrors: true` (transports/index.ts:54-55), so `response.statusCode`, `response.headers`, and `response.body` are all available without the call throwing on non-2xx — the loop above works as written.
- The added `Array.isArray(error?.message)` guard also hardens the existing `error.message.join(...)` call, which currently assumes `message` is always a string array and would itself throw a `TypeError` on a differently-shaped error body (e.g. a 429 HTML page or empty body). This is a strict improvement to the existing throw path.
- `setTimeout` is a global in the Node 24 runtime; no import needed. If your `eslint.config.mjs` flags `setTimeout`/`Math.random` in this context, the `sleep`/jitter helpers are the only spot to address.
- Because `ivantiApiRequestAllItems` and `ivantiApiRequestAllItemsWithLimit` call `ivantiApiRequest` per page, they automatically inherit retry/backoff — a transient 429 on page 7 no longer discards pages 1-6.

Optionally apply the same loop to `ivantiApiRequestFormData` (transports/index.ts:153-174), `ivantiApiRequestBinary` (transports/index.ts:188-215). Those currently use `returnFullResponse` inconsistently (`ivantiApiRequestFormData` does not set it), so if you want retry there too, add `returnFullResponse: true, ignoreHttpStatusErrors: true` to their `options` first and factor the loop into a private helper that takes `options` and returns the body. Keeping the initial change scoped to `ivantiApiRequest` (which backs all the paginated/read paths) already resolves the core "lost progress mid-pagination" risk.

### Option B — Make the README match reality (only if Option A is rejected)

If retry is intentionally out of scope, delete the unmet claims so docs match behavior.

`README.md:1407` BEFORE:

```
**Best Practices**:
- Implement exponential backoff on 429 errors
- Cache results when appropriate
- Batch operations when possible
```

AFTER (reframe as user guidance, not a node feature):

```
**Best Practices**:
- Add an n8n "Wait" / error-workflow retry around this node to back off on 429 errors;
  this node does not retry automatically
- Cache results when appropriate
- Batch operations when possible
```

`README.md:42` BEFORE:

```
- **Comprehensive Error Handling**: Detailed error messages and validation
```

AFTER:

```
- **Clear Error Messages**: Surfaces Ivanti API error details and validation failures
```

## Verification

For **Option A**:
1. Type-check / lint with the project tooling: `npx n8n-node lint` and `npx n8n-node build` (or `npm run build`). Confirm no new TS/ESLint errors from the loop, `sleep`, and `computeBackoffMs`.
2. Static confirmation that retry now exists: `grep -rn "RETRYABLE_STATUS\|computeBackoffMs\|Retry-After\|retry-after" nodes/` should now return matches (it previously returned nothing).
3. Behavioral check (unit or manual): point the credential at a mock/stub that returns `429` with `Retry-After: 1` on the first call and `200` on the second, run a Search/Get All operation, and confirm the operation succeeds after one wait instead of throwing. Then return `429` for all `MAX_ATTEMPTS` calls and confirm it throws a `NodeOperationError` after the configured number of attempts.
4. Pagination check: stub the OData endpoint to return data for pages 1-6, a single `429` on page 7, then data, and confirm `ivantiApiRequestAllItems` returns the full set rather than discarding pages 1-6.
5. Update `CHANGELOG.md` and bump `package.json` version per AGENTS.md ("If you are updating the npm package version, make sure to update CHANGELOG.md").

For **Option B**: re-read `README.md:42` and `README.md:1407`; confirm neither line claims automatic exponential backoff / "Comprehensive Error Handling" as a node feature. `grep -n "exponential backoff\|Comprehensive Error Handling" README.md` should no longer report a node-implemented feature.

## Related findings

None referenced in this task. (If a separate finding covers the inconsistent `returnFullResponse`/`ignoreHttpStatusErrors` flags across `ivantiApiRequestFormData`/`ivantiApiRequestBinary`, the Option A refactor note above is the natural place to address it.)
