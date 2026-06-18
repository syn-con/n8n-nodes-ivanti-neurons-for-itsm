# Finding 45: Webhook returns 400 with WWW-Authenticate: Basic for all failures and echoes internal error detail

| Field | Value |
|---|---|
| Category | Security |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:210-224 (catch block); 291-316 (validateRequestAuth) |

> Note: the canonical finding cites `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:211-220`. The real path includes the `IvantiNeuronsForItsmConnector/` subfolder: `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`. The cited line numbers (211-220) are accurate.

## Problem

The inbound webhook handler's `catch` block responds identically to every `NodeOperationError`, regardless of whether the failure was an authentication failure, a malformed body, a missing parameter, or a terminal-state transaction. It always returns HTTP `400`, always sends a `WWW-Authenticate: Basic realm="Webhook"` header, and always echoes `error.message` verbatim to the (potentially unauthenticated) caller.

From `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:210-224`:

```ts
} catch (error) {
	if (error instanceof NodeOperationError) {

		resp.writeHead(400, { 
			'WWW-Authenticate': 'Basic realm="Webhook"',
			'Content-Type': 'application/json'
		 });
		 resp.end(JSON.stringify({
			Status: 'Error',
			Message: error.message,
		}));
		return { noWebhookResponse: true };
	}
	throw error;
}
```

Three distinct problems:

1. **Wrong status code for auth failures.** Authentication failures (`validateRequestAuth` at lines 291-316, which throws `'Invalid Authorization'` / `'Invalid Authorization Type'`) return `400 Bad Request` instead of `401 Unauthorized`.

2. **Incorrect/misleading `WWW-Authenticate` challenge.** The handler unconditionally advertises `Basic realm="Webhook"`. But the credential supports three webhook auth modes — `base`, `apiKey`, and `header` (see `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:42-46`):

   ```ts
   options: [
       { name: 'Basic Auth', value: 'base' },
       { name: 'Api Key', value: 'apiKey' },
       { name: 'Header', value: 'header' },
   ],
   ```

   A `WWW-Authenticate: Basic` challenge is only correct when the configured mode is `base`. For `apiKey`/`header` modes the challenge is wrong, and per RFC 7235 the `WWW-Authenticate` header belongs on a `401` response, not on `400`/`200`/etc.

3. **Internal error detail disclosed to unauthenticated callers.** `Message: error.message` leaks internal validation semantics to anyone who can reach the URL. Because `validateRequestAuth` runs *before* `validateAutomationTransaction` and `validateParameters`, a caller that passes auth sees messages such as `Parameter <name> is required`, `Parameter <name> must be a number`, and `Transaction is already completed or failed or aborted` (lines 257, 268, 357) — revealing parameter names, expected types, and transaction-state semantics. The pre-auth checks (`Invalid Content-Type`, `Invalid Workflow ID`, lines 185/189) are reachable with no credentials at all and leak the workflow-id replay-protection scheme.

A secondary structural issue: every validator (`validateRequestAuth`, `validateAutomationTransaction`, `validateParameters`) throws the same plain `NodeOperationError`, so the current `catch` block has **no way to tell an auth failure from a body/parameter failure**. The fix must first make auth failures distinguishable.

## Why it matters

- **Information disclosure (the core security concern).** An unauthenticated or semi-authenticated caller probing the endpoint receives precise internal detail — required parameter names and their types, transaction lifecycle states, and the presence of the `X-Workflow-Id` anti-replay check. This is reconnaissance material that should not be handed to an untrusted caller. The endpoint is a public inbound webhook URL, so the "caller" is anyone on the network.
- **Protocol correctness / interoperability.** Returning `400` for auth failures and advertising `Basic` when the server actually expects an API-key/custom header misleads clients and any intermediary that interprets `WWW-Authenticate`. Auth failures should be `401`; malformed requests should be `400`.
- **Low severity is appropriate** because exploitation requires network reach to the webhook and yields only metadata (no records, no credentials), but the fix is cheap and removes an unnecessary leak.

## Resolution

The goal: respond `401` (with a correct, mode-specific challenge only in `base` mode) for **auth** failures returning a generic `"Unauthorized"` body, `400` for **malformed/validation** failures, and stop echoing raw internal messages for auth failures.

### Step 1 — Make auth failures distinguishable with a dedicated error class

Add a small `WebhookAuthError` class so the `catch` block can branch on it. Place it near the bottom of the same file, beside `encodeBasicAuth` (`nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`, after line 363):

```ts
/**
 * Marker error for inbound-webhook authentication failures.
 *
 * Distinguished from validation NodeOperationErrors so the webhook handler can
 * respond 401 (instead of 400) and return a generic "Unauthorized" body that
 * does not disclose internal detail to the caller.
 */
class WebhookAuthError extends Error {
	constructor(message = 'Unauthorized') {
		super(message);
		this.name = 'WebhookAuthError';
	}
}
```

### Step 2 — Throw `WebhookAuthError` from `validateRequestAuth`

In `validateRequestAuth` (lines 291-316), replace each auth-failure `NodeOperationError` with `WebhookAuthError`. Keep the messages internal — they are no longer sent to the caller, only surfaced in n8n logs.

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
		if (headers['authorization'] !== `Basic ${encodedAuth}`) {
			throw new WebhookAuthError('Invalid Authorization');
		}
	} else if (credentials.type === 'apiKey') {
		if (headers['authorization'] !== `${credentials.webhookApiKey}`) {
			throw new WebhookAuthError('Invalid Authorization');
		}
	} else if (credentials.type === 'header') {
		if (!headers[credentials.header as string]) {
			throw new WebhookAuthError('Invalid Authorization');
		}
		if (headers[credentials.header as string] !== credentials.webhookApiKey) {
			throw new WebhookAuthError('Invalid Authorization');
		}
	} else {
		throw new WebhookAuthError('Invalid Authorization Type');
	}
```

Leave the `'No credentials got returned!'` throw at lines 293-295 as a `NodeOperationError` — that is a server misconfiguration, not a caller auth failure, and it is fine for it to surface as a `400`/error in n8n's own logs. (Optionally also convert it to `WebhookAuthError` so a misconfigured node never leaks "No credentials" to a caller; either is acceptable.)

### Step 3 — Branch the `catch` block on error type and stop echoing auth detail

Replace the `catch` block (lines 210-224). For auth failures: `401`, generic body, and a `WWW-Authenticate: Basic` header **only** when the configured mode is `base`. For everything else: `400` with the existing message (these are validation errors *after* successful auth, so echoing is far less sensitive — but you may also genericise them; see the note below).

BEFORE (lines 210-224):

```ts
		} catch (error) {
			if (error instanceof NodeOperationError) {

				resp.writeHead(400, { 
					'WWW-Authenticate': 'Basic realm="Webhook"',
					'Content-Type': 'application/json'
				 });
				 resp.end(JSON.stringify({
					Status: 'Error',
					Message: error.message,
				}));
				return { noWebhookResponse: true };
			}
			throw error;
		}
```

AFTER:

```ts
		} catch (error) {
			if (error instanceof WebhookAuthError) {
				const responseHeaders: IDataObject = { 'Content-Type': 'application/json' };
				// Advertise a challenge only for HTTP Basic mode; apiKey/header modes
				// are not standard HTTP auth schemes and must not claim "Basic".
				const credentials = await this.getCredentials('ivantiNeuronsForItsmConnectorAuthApi');
				if (credentials?.type === 'base') {
					responseHeaders['WWW-Authenticate'] = 'Basic realm="Webhook"';
				}
				resp.writeHead(401, responseHeaders as Record<string, string>);
				resp.end(JSON.stringify({
					Status: 'Error',
					Message: 'Unauthorized',
				}));
				return { noWebhookResponse: true };
			}
			if (error instanceof NodeOperationError) {
				resp.writeHead(400, { 'Content-Type': 'application/json' });
				resp.end(JSON.stringify({
					Status: 'Error',
					Message: error.message,
				}));
				return { noWebhookResponse: true };
			}
			throw error;
		}
```

Notes:
- `IDataObject` is already imported at line 4, so no new import is needed for the header object. `WebhookAuthError` is defined in the same module (Step 1), so no import is needed for it either.
- The `await this.getCredentials(...)` call inside the catch is cheap (n8n caches the decrypted credential for the execution) and is the simplest way to know the mode at response time. If you prefer to avoid a second fetch, capture the mode into a `let authMode: string | undefined` declared before the `try` and set it inside `validateRequestAuth` via a returned value — but the extra `getCredentials` call is acceptable and keeps the diff localised.

### Optional hardening — also genericise post-auth validation messages

The pre-auth checks at lines 184-190 (`Invalid Content-Type`, `Invalid Workflow ID`) currently fall into the `400` branch and are reachable with no credentials. If you want to disclose nothing pre-auth, reorder so `validateRequestAuth` runs first, or throw `WebhookAuthError` for the workflow-id mismatch (it is effectively an authorization check). At minimum, the content-type and workflow-id messages are generic enough to keep; the parameter/transaction messages (lines 257-276, 357) only fire after successful auth, so echoing them to an authenticated Ivanti runbook is acceptable. This step is optional; Steps 1-3 resolve the finding as written.

## Verification

1. **Build / typecheck.** From the repo root run the project's build (e.g. `npm run build`) and lint (`npm run lint`). Confirm no TypeScript errors — in particular that `WebhookAuthError` resolves and the `resp.writeHead(401, responseHeaders as Record<string, string>)` cast type-checks.
2. **Auth-failure path (manual).** Activate a workflow with this trigger using `Basic Auth` mode. POST to the webhook URL with a wrong/absent `Authorization` header but otherwise valid `Content-Type: application/json` and matching `X-Workflow-Id`. Confirm the response is `401`, body is `{"Status":"Error","Message":"Unauthorized"}`, and the response carries `WWW-Authenticate: Basic realm="Webhook"`.
3. **Auth-failure, non-Basic mode.** Reconfigure the credential to `Api Key` (or `Header`) mode and repeat with a bad key. Confirm `401`, generic `Unauthorized` body, and **no** `WWW-Authenticate` header.
4. **Validation-failure path.** With valid auth, valid transaction header, but a missing required input parameter, confirm the response is still `400` (not `401`) and that no `WWW-Authenticate` header is present.
5. **No detail leak.** Confirm the auth-failure response body never contains `Invalid Authorization`, parameter names, or transaction-state wording — only `Unauthorized`.

Use `curl -i` to inspect status line and headers, for example:

```
curl -i -X POST '<webhook-url>' \
  -H 'Content-Type: application/json' \
  -H 'X-Workflow-Id: <id>' \
  -H 'Authorization: Basic wrong' \
  -d '{}'
```

## Related findings

None.
