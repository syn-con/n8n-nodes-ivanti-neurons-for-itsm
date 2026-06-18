# Finding 10: ivantiApiRequest error handler calls error.message.join() and throws TypeError on non-array error bodies

| Field | Value |
|---|---|
| Category | Bugs / Correctness |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/transports/index.ts:59-62, nodes/IvantiNeuronsForITSM/transports/index.ts:218-223 |

## Problem
In `ivantiApiRequest`, the non-2xx branch blindly casts the response body to `IVantiApiError` and calls `.join()` on `message`, assuming it is always a `string[]`:

```ts
// nodes/IvantiNeuronsForITSM/transports/index.ts:58-62
const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
if(response.statusCode < 200 || response.statusCode >= 300){
	const error = response.body as IVantiApiError;
	throw new NodeOperationError(this.getNode(), error.message.join(', '));
}
```

The request that produced this response is configured with `json: false` and `ignoreHttpStatusErrors: true`:

```ts
// nodes/IvantiNeuronsForITSM/transports/index.ts:52-55
	json: false,
	skipSslCertificateValidation: credential.skipSslVerification as boolean,
	returnFullResponse: true,
	ignoreHttpStatusErrors : true
```

Because status errors are ignored (so this handler is the only place failures surface) and `json: false` means the body is returned as the raw payload, `response.body` for a real failure is frequently:

- a **string** — HTTP 500 HTML error page, plain-text gateway/proxy error (502/503/504), an empty body, or any non-JSON response. `("...").message` is `undefined`, and `undefined.join` throws `TypeError: Cannot read properties of undefined (reading 'join')`.
- a **JSON object whose `message` is a string** (or absent) — e.g. `401`/`403` auth errors, OData errors shaped `{ "error": { "code": "...", "message": "..." } }`. Here `error.message` is either a string (`"...".join` is not a function) or `undefined` (`.join` throws).

The `message: string[]` shape is essentially never guaranteed across the variety of failure responses an ITSM tenant, its reverse proxy, or the auth layer can emit.

The supporting interface is also defective (line 218-223): it is **misspelled** `IVantiApiError` (should be `IvantiApiError`), and declares three fields (`code`, `description`, `help`) that are never read anywhere in the codebase — only `message` is accessed:

```ts
// nodes/IvantiNeuronsForITSM/transports/index.ts:218-223
export interface IVantiApiError {
	code: string
	description: string
	message: string[]
	help: string
  }
```

## Why it matters
- **Runtime failure that masks the real error.** Instead of a clear `NodeOperationError` carrying the HTTP status and server message, the user gets an opaque `TypeError: Cannot read properties of undefined (reading 'join')`. This is exactly the case for the most common operational failures (auth expiry → 401/403, server faults → 500 HTML, gateway issues → 502/503/504).
- **Defeats `continueOnFail`.** A `TypeError` thrown from the transport propagates as an unexpected JS exception rather than a well-formed `NodeOperationError`. Router/`continueOnFail` logic that expects a node error to push to the error output is bypassed or produces a confusing item, so workflows that intentionally tolerate failures still break.
- **Loses diagnostic context.** The thrown message never includes `response.statusCode`, so even when it does work (array body) the user cannot tell a 401 from a 500.
- **Maintainability.** A misspelled, partially-dead interface invites the same wrong assumption to be copied elsewhere.

## Resolution
Make the error message construction defensive: handle array, string, object-with-string-message, and unknown bodies, always include the status code, and rename/trim the interface.

### Step 1 — Rename and tighten the error interface (lines 218-223)

BEFORE:
```ts
export interface IVantiApiError {
	code: string
	description: string
	message: string[]
	help: string
  }
```

AFTER:
```ts
/** Shape of a structured error body returned by the Ivanti API (best-effort; fields may be absent). */
export interface IvantiApiError {
	message?: string | string[];
	error?: { code?: string; message?: string };
}
```

`message` covers Ivanti's `string[]` form and the common single-string form; the nested `error` covers the standard OData error envelope. All fields are optional because non-JSON / proxy responses will not match.

### Step 2 — Add a defensive message-builder helper

Add this helper just above `ivantiApiRequest` (top of `nodes/IvantiNeuronsForITSM/transports/index.ts`, after the `ODATA_BATCH_SIZE` constant):

```ts
/**
 * Builds a human-readable error message from an Ivanti API failure response body,
 * which (with `json: false`) may be a string, a structured object, or undefined.
 */
function buildIvantiErrorMessage(statusCode: number, body: unknown): string {
	let detail: string;

	if (typeof body === 'string') {
		detail = body.trim();
	} else if (body && typeof body === 'object') {
		const err = body as IvantiApiError;
		const msg = err.message ?? err.error?.message;
		if (Array.isArray(msg)) {
			detail = msg.join(', ');
		} else if (typeof msg === 'string') {
			detail = msg;
		} else {
			detail = JSON.stringify(body);
		}
	} else {
		detail = '';
	}

	return detail
		? `Ivanti API request failed (HTTP ${statusCode}): ${detail}`
		: `Ivanti API request failed (HTTP ${statusCode})`;
}
```

### Step 3 — Use the helper in the error branch (lines 59-62)

BEFORE:
```ts
if(response.statusCode < 200 || response.statusCode >= 300){
	const error = response.body as IVantiApiError;
	throw new NodeOperationError(this.getNode(), error.message.join(', '));
}
```

AFTER:
```ts
if (response.statusCode < 200 || response.statusCode >= 300) {
	throw new NodeOperationError(
		this.getNode(),
		buildIvantiErrorMessage(response.statusCode, response.body),
	);
}
```

### Notes
- No other file imports `IVantiApiError` (verified with `grep -rn "IVantiApiError" nodes/ credentials/` — only the two lines in this file), so the rename is contained and safe.
- The `buildIvantiErrorMessage` helper is module-private (not exported); if other transports want the same behavior later it can be exported, but only `ivantiApiRequest` consumes it today.
- Optionally pass `{ description: ... }` as the third `NodeOperationError` arg to carry the raw body for the node's detail panel; not required for the fix.

## Verification
1. Build / typecheck: run `npm run build` (or the project's `n8n-node` build/lint command) from the repo root. It must compile with no `string[]`-related type errors and no unused-symbol warnings for the renamed interface.
2. Lint: run the project ESLint config (`eslint.config.mjs`) — the previously-unused interface fields are gone, so no new warnings should appear.
3. Manual behavior check (or a unit test around `buildIvantiErrorMessage`): assert each input shape produces a clean string and never throws:
   - `buildIvantiErrorMessage(500, '<html>Internal Server Error</html>')` → contains `HTTP 500`, no throw.
   - `buildIvantiErrorMessage(401, { error: { message: 'Unauthorized' } })` → `...HTTP 401): Unauthorized`.
   - `buildIvantiErrorMessage(400, { message: ['a', 'b'] })` → `...HTTP 400): a, b`.
   - `buildIvantiErrorMessage(502, undefined)` → `...failed (HTTP 502)`, no throw.
4. End-to-end: point the credential at a tenant and trigger a 401 (bad API key) or 404 (bad endpoint). Confirm the node surfaces a `NodeOperationError` with the status code and message instead of a `TypeError`, and that an operation run with "Continue On Fail" routes the item to the error output instead of aborting.

## Related findings
None.
