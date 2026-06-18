# Finding 23: Webhook auth tokens compared with non-constant-time !== (timing side-channel)

| Field | Value |
|---|---|
| Category | Security |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:296-311 |

## Problem
The inbound webhook trigger validates the `Authorization`/custom header against the configured credential using JavaScript's `!==` operator in all three authentication branches. `validateRequestAuth` (lines 291-316) contains:

```ts
	if (credentials.type === 'base') {
		const encodedAuth = encodeBasicAuth(credentials.username as string, credentials.password as string);
		if (headers['authorization'] !== `Basic ${encodedAuth}`) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
	} else if (credentials.type === 'apiKey') {
		if (headers['authorization'] !== `${credentials.webhookApiKey}`) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
	} else if (credentials.type === 'header') {
        if(!headers[credentials.header as string]) {
            throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
        }
		if(headers[credentials.header as string] !== credentials.webhookApiKey) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
	} else {
		throw new NodeOperationError(this.getNode(), 'Invalid Authorization Type');
	}
```

`===`/`!==` on strings in V8 short-circuits as soon as the first differing byte (or a length mismatch) is found. The time taken to reject a wrong token therefore depends on how many leading characters were correct, and on whether the lengths matched. A remote, unauthenticated caller who can POST to this webhook can measure response latency to learn the secret's length and recover it one character at a time.

## Why it matters
This webhook is publicly reachable (it is the URL Ivanti automation runbooks POST to) and the auth check is the gate that protects downstream automation from being driven by arbitrary callers. A timing oracle on the comparison turns a "secret you must guess" into a search that is linear (rather than exponential) in the secret length, materially lowering the cost of forging a valid request. Constant-time comparison removes the per-character / length signal so that all rejected guesses take the same time regardless of how close they were.

## Resolution
Replace each direct `!==` secret comparison with a constant-time check using Node's built-in `crypto.timingSafeEqual`. Because `timingSafeEqual` throws if the two Buffers differ in length (and length itself is sensitive), compare fixed-length SHA-256 digests of both sides — this both equalizes Buffer length and avoids leaking the secret length.

### Step 1 — import the crypto primitives

In `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`, after the existing imports (currently ending at line 10), add a Node `crypto` import.

BEFORE (lines 1-11):
```ts
import type {
	IHookFunctions,
	IWebhookFunctions,
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

```

AFTER:
```ts
import type {
	IHookFunctions,
	IWebhookFunctions,
	IDataObject,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { createHash, timingSafeEqual } from 'node:crypto';

```

### Step 2 — add a constant-time comparison helper

Add this helper next to `encodeBasicAuth` (which lives at lines 361-363, at the bottom of the file). It hashes both inputs to a fixed 32-byte digest and compares them with `timingSafeEqual`, so the comparison time is independent of the secret's value and length.

```ts
/**
 * Constant-time string comparison.
 *
 * Both inputs are reduced to fixed-length SHA-256 digests before comparison so
 * that `timingSafeEqual` never sees mismatched buffer lengths (which would both
 * throw and leak the secret's length). This prevents a remote caller from using
 * response-timing differences to recover the configured webhook secret.
 */
function safeCompare(a: string, b: string): boolean {
	const aHash = createHash('sha256').update(a, 'utf8').digest();
	const bHash = createHash('sha256').update(b, 'utf8').digest();
	return timingSafeEqual(aHash, bHash);
}
```

### Step 3 — use the helper in all three branches

Rewrite the body of `validateRequestAuth` (lines 296-314) to call `safeCompare` instead of `!==`. Note the header value can be `undefined`/`string[]`, so coerce it to a string before hashing.

BEFORE (lines 296-314):
```ts
	if (credentials.type === 'base') {
		const encodedAuth = encodeBasicAuth(credentials.username as string, credentials.password as string);
		if (headers['authorization'] !== `Basic ${encodedAuth}`) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
	} else if (credentials.type === 'apiKey') {
		if (headers['authorization'] !== `${credentials.webhookApiKey}`) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
	} else if (credentials.type === 'header') {
        if(!headers[credentials.header as string]) {
            throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
        }
		if(headers[credentials.header as string] !== credentials.webhookApiKey) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
	} else {
		throw new NodeOperationError(this.getNode(), 'Invalid Authorization Type');
	}
```

AFTER:
```ts
	if (credentials.type === 'base') {
		const encodedAuth = encodeBasicAuth(credentials.username as string, credentials.password as string);
		const provided = String(headers['authorization'] ?? '');
		if (!safeCompare(provided, `Basic ${encodedAuth}`)) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
	} else if (credentials.type === 'apiKey') {
		const provided = String(headers['authorization'] ?? '');
		if (!safeCompare(provided, `${credentials.webhookApiKey}`)) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
	} else if (credentials.type === 'header') {
		const headerName = credentials.header as string;
		const provided = headers[headerName];
		if (!provided) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
		if (!safeCompare(String(provided), `${credentials.webhookApiKey}`)) {
			throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
		}
	} else {
		throw new NodeOperationError(this.getNode(), 'Invalid Authorization Type');
	}
```

Notes:
- The `header` branch keeps the existing presence check (`if (!provided)`) before the secret comparison; that early-out only leaks "was any value sent", not the secret's content, and matches existing behavior.
- `safeCompare` returns `true`/`false`, so the `if` conditions invert to `if (!safeCompare(...))`.
- `encodeBasicAuth` (lines 361-363) is unchanged and still used to build the expected Basic value.
- Using `node:crypto` (a built-in, already available in n8n's runtime) adds no new dependency to `package.json`.

## Verification
1. Lint/build the package (per AGENTS.md, prefer the `n8n-node` CLI): run `npx n8n-node lint` and `npx n8n-node build` (or the project's `npm run lint` / `npm run build`) and confirm there are no new TypeScript or ESLint errors — in particular that the `node:crypto` import and the `safeCompare`/branch edits type-check.
2. Confirm no `!==`/`===` direct secret comparisons remain in `validateRequestAuth`: `grep -n "headers\['authorization'\] !==" nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts` should return nothing, and `grep -n "safeCompare" nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts` should show the helper definition plus three call sites.
3. Functional sanity check: with a configured credential, send a webhook request with the correct token and confirm it is accepted (200), and with an incorrect token of the same and of different lengths confirm both are rejected with `Invalid Authorization` (400). Behavior for valid/invalid tokens is unchanged; only the timing characteristics differ.

## Related findings
None.
