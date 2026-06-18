# Finding 46: Credential 'Header' field documented as a header value but used as the header name

| Field | Value |
|---|---|
| Category | Security |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:77-88, nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:305-311 |

## Problem

In the `header` webhook authentication mode the credential exposes a field named `header` that is documented as a *value*:

`credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:76-88`
```ts
// Shown only for Header auth mode — the full raw header value expected from the caller
{
    displayName: 'Header',
    name: 'header',
    type: 'string',
    description: 'The raw header value for the Header auth mode. This is used for the Header auth mode.',
    displayOptions: {
        show: {
            type: ['header'],
        },
    },
    default: '',
},
```

The class-level JSDoc reinforces the same (incorrect) mental model:

`credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:13-15`
```ts
 * - **Header** – arbitrary raw header value (e.g. a pre-shared token)
```

But the trigger actually treats `credentials.header` as the header **name** to look up, and compares the looked-up value against the *separate* `webhookApiKey` secret:

`nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:305-311`
```ts
} else if (credentials.type === 'header') {
    if(!headers[credentials.header as string]) {
        throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
    }
    if(headers[credentials.header as string] !== credentials.webhookApiKey) {
        throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
    }
}
```

So the contract is: `header` = the header name (e.g. `x-api-key`), `webhookApiKey` = the expected secret value. The description says the opposite.

There are two additional defects in the same block:

1. **No lowercase normalization.** n8n's `getHeaderData()` returns header keys already lowercased (Node's HTTP layer does this). The lookup `headers[credentials.header as string]` does NOT lowercase `credentials.header`, so if a user enters a name with any uppercase letter (e.g. `X-Api-Key`), the lookup is `headers['X-Api-Key']` which is `undefined`, and the first guard at line 306 throws `Invalid Authorization` for every request — the webhook silently breaks even when the caller sends the correct header.
2. **No empty-name guard.** With `default: ''`, if the user leaves `header` blank, the code does `headers['']`, which is `undefined`, so line 306 always throws. The failure mode is opaque (`Invalid Authorization`) rather than a clear configuration error.

## Why it matters

This is a security-relevant misconfiguration trap:

- A user following the field description will put the *secret token* into the `header` field (thinking it is "the raw header value") and something else into `webhookApiKey`. The auth check then compares `headers[<secret-token>]` (almost always `undefined`) — which means every legitimate request is rejected (denial of service for the webhook), or, worse, a user "fixes" it by relaxing things until it passes, weakening the intended auth.
- The missing lowercase handling means even a correctly-intentioned user picking a conventional header name like `X-Api-Key` gets a webhook that rejects all traffic, with a generic `Invalid Authorization` message and no hint that casing is the cause.
- The empty-name case produces the same opaque failure.

Impact is bounded (fail-closed: it rejects rather than accepts unauthorized callers), hence low severity, but it directly harms correct configuration of webhook authentication and produces confusing, hard-to-diagnose behavior.

## Resolution

Three concrete changes: (1) fix the credential field label/description and JSDoc; (2) normalize the header name to lowercase and reject an empty name in the trigger.

### 1. Fix the credential field copy

File: `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts`

BEFORE (lines 76-88):
```ts
// Shown only for Header auth mode — the full raw header value expected from the caller
{
    displayName: 'Header',
    name: 'header',
    type: 'string',
    description: 'The raw header value for the Header auth mode. This is used for the Header auth mode.',
    displayOptions: {
        show: {
            type: ['header'],
        },
    },
    default: '',
},
```

AFTER:
```ts
// Shown only for Header auth mode — the NAME of the header that carries the secret.
// The expected secret value is configured separately in "Webhook API Key".
{
    displayName: 'Header Name',
    name: 'header',
    type: 'string',
    placeholder: 'x-api-key',
    description: 'The name of the HTTP header the caller must send. Its value is matched against the Webhook API Key. Header names are case-insensitive.',
    displayOptions: {
        show: {
            type: ['header'],
        },
    },
    default: '',
    required: true,
},
```

Notes:
- Keep `name: 'header'` unchanged so existing saved credentials are not broken (renaming the internal `name` would orphan stored values).
- `required: true` makes the empty-name case visible in the UI before it ever reaches the trigger.

Also fix the class JSDoc.

BEFORE (`credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:13-15`):
```ts
 * Supports two authentication modes for the inbound webhook side:
 * - **Base** – HTTP Basic Auth (username + password)
 * - **Header** – arbitrary raw header value (e.g. a pre-shared token)
```

AFTER:
```ts
 * Supports two authentication modes for the inbound webhook side:
 * - **Base** – HTTP Basic Auth (username + password)
 * - **Header** – a named header (Header Name) whose value must equal the
 *   Webhook API Key (e.g. an "x-api-key: <token>" pre-shared token)
```

### 2. Normalize the header name and reject empty names in the trigger

File: `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`

BEFORE (lines 305-311):
```ts
} else if (credentials.type === 'header') {
    if(!headers[credentials.header as string]) {
        throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
    }
    if(headers[credentials.header as string] !== credentials.webhookApiKey) {
        throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
    }
}
```

AFTER:
```ts
} else if (credentials.type === 'header') {
    const headerName = ((credentials.header as string) ?? '').trim().toLowerCase();
    if (headerName === '') {
        throw new NodeOperationError(this.getNode(), 'Header auth is selected but no Header Name is configured');
    }
    // n8n returns header keys already lowercased, so look up with a lowercased name.
    const headerValue = headers[headerName];
    if (!headerValue) {
        throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
    }
    if (headerValue !== credentials.webhookApiKey) {
        throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
    }
}
```

This keeps the existing fail-closed behavior (still throws `Invalid Authorization` on mismatch) while:
- lowercasing the configured name so any casing the user types resolves against n8n's lowercased header keys,
- trimming accidental whitespace,
- emitting a clear, distinct error when the name is unconfigured instead of a misleading `Invalid Authorization`.

No new shared helper/module is needed — the change is local to `validateRequestAuth`.

## Verification

1. Build / typecheck and lint (the package uses the `n8n-node` CLI per AGENTS.md):
   - `npx n8n-node lint` (or the repo's configured lint script) — confirm no new lint/type errors in the two edited files.
   - `npm run build` — confirm a clean TypeScript compile.
2. Manual confirmation of the UI copy: open the credential in n8n, select **Header** auth, and verify the field now reads **Header Name** with placeholder `x-api-key` and is marked required.
3. Manual auth behavior check against a running webhook (header mode, Header Name = `X-Api-Key`, Webhook API Key = `secret123`):
   - POST with header `x-api-key: secret123` and the required `content-type`, `x-workflow-id`, `x-transaction-id` → request passes the auth stage (previously would have thrown because `headers['X-Api-Key']` was `undefined`).
   - POST with header `x-api-key: wrong` → `400` with `Invalid Authorization`.
   - Configure Header mode with an empty Header Name (if `required` is bypassed) → `400` with `Header auth is selected but no Header Name is configured`.

## Related findings

None.
