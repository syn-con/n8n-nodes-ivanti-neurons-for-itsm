# Finding 20: Connector Auth credential conflates inbound webhook auth with outbound API auth (SRP/ISP)

| Field | Value |
|---|---|
| Category | SOLID (esp. Single Responsibility) |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:36-142`, `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:291-311`, `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:32-47` |

## Problem
The single credential type `IvantiNeuronsForItsmConnectorAuthApi` carries two unrelated authentication concerns.

**Concern A — inbound webhook validation** (`credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:36-105`). These fields describe how the trigger validates the *caller* of the inbound webhook:

```typescript
// Selects how the trigger node validates the inbound webhook caller's identity
{
    displayName: 'Webhook Authentication Type',
    name: 'type',
    type: 'options',
    default: 'base',
    ...
    options: [
        { name: 'Basic Auth', value: 'base' },
        { name: 'Api Key', value: 'apiKey' },
        { name: 'Header', value: 'header' },
    ],
},
// username / password / header / webhookApiKey ...
```

They are consumed *manually* (not via n8n's `authenticate` block) in the trigger's `validateRequestAuth` (`IvantiNeuronsForItsmConnectorTrigger.node.ts:291-311`):

```typescript
async function validateRequestAuth(this: IWebhookFunctions, headers: IDataObject): Promise<boolean> {
	const credentials = await this.getCredentials('ivantiNeuronsForItsmConnectorAuthApi');
	...
	if (credentials.type === 'base') {
		const encodedAuth = encodeBasicAuth(credentials.username as string, credentials.password as string);
		if (headers['authorization'] !== `Basic ${encodedAuth}`) { ... }
	} else if (credentials.type === 'apiKey') {
		if (headers['authorization'] !== `${credentials.webhookApiKey}`) { ... }
	} else if (credentials.type === 'header') {
		...
		if(headers[credentials.header as string] !== credentials.webhookApiKey) { ... }
	}
	...
}
```

**Concern B — outbound OData API auth** (`credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:108-142`). These fields describe how the node makes *outbound* calls to Ivanti:

```typescript
{ displayName: 'Ivanti Neurons for ITSM Tenant', name: 'tenant', ... required: true },
{ displayName: 'Ivanti Neurons for ITSM API Key', name: 'apiKey', ... required: true,
  typeOptions: { password: true } },
{ displayName: 'Is On Prem', name: 'isOnPrem', type: 'boolean', default: false },
{ displayName: 'Skip SSL Verification', name: 'skipSslVerification', type: 'boolean', default: false }
```

They drive the `authenticate` and `test` blocks (lines 146-180), and are also read by `ivantiApiRequest` (`transports/index.ts:32-47`) and by `validateAutomationTransaction` (`IvantiNeuronsForItsmConnectorTrigger.node.ts:342-354`).

The `test` block only exercises the outbound `apiKey`/`tenant` path (it does a `GET` against `/N8N_AuthTypes`). The inbound fields (`type`/`username`/`password`/`header`/`webhookApiKey`) are never validated by the test, so the credential's "test successful" message does not reflect whether the inbound webhook auth will actually work.

Two further correctness wrinkles tied to the conflated design:

1. `webhookApiKey` is declared `required: true` (line 95) but only shown for `type` in `['apiKey','header']`. When `type === 'base'` the field is hidden yet still marked required, which is inconsistent UX driven by cramming both auth modes into one credential.
2. The `apiKey` outbound field is `required: true`, so a user who only wants the inbound webhook (and never the live transaction status check) is still forced to supply outbound API credentials.

## Why it matters
- **Misleading credential test (correctness/UX):** The test claims to validate "the credential," but only validates the outbound API key. A user can configure invalid inbound webhook auth (wrong `header` name, empty `webhookApiKey`), see a green "connection successful," and then have every inbound webhook silently rejected with `400 Invalid Authorization` at runtime.
- **Interface Segregation violation:** Three consumers each depend on a different subset of fields — `validateRequestAuth` needs only the inbound fields; `ivantiApiRequest`/`authenticate`/`test` need only the outbound fields; `validateAutomationTransaction` needs the outbound fields. Each is forced to depend on a credential carrying fields it does not use.
- **Single Responsibility violation / fragility:** One credential changes for two unrelated reasons (inbound caller policy vs. outbound API connection). The 'Report Transaction' / live-status path relies on outbound fields coexisting in the same object that the webhook auth uses; refactoring either concern risks breaking the other.
- **Confusing UX:** The credential UI shows webhook-caller auth options interleaved with tenant/API-key/SSL fields, with no visual separation of "who may call me" vs. "how I call Ivanti."

## Resolution
There are two viable paths. **Option 1 (recommended)** splits the credential into two single-responsibility credentials and has the trigger declare both. **Option 2 (minimal, non-breaking)** keeps one credential but groups/separates the concerns and extends the test. Pick Option 1 if a breaking credential change is acceptable for the next major version; otherwise Option 2.

> Note on n8n manual consumption: both inbound and outbound concerns here are read manually via `this.getCredentials(...)`, so splitting is purely a matter of which credential name each call site requests. The only declarative wiring (`authenticate` + `test`) belongs entirely to the outbound concern.

---

### Option 1 (recommended): split into two credentials

**Step 1 — Create the outbound API credential.** New file `credentials/IvantiNeuronsForItsmConnectorApi.credentials.ts`. This owns tenant/apiKey/isOnPrem/skipSslVerification, the `authenticate` block, and the `test` (which now validates exactly what it carries):

```typescript
import type {
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	IAuthenticateGeneric,
} from 'n8n-workflow';

/**
 * Outbound auth for the Connector trigger: how the node calls the Ivanti
 * Neurons for ITSM OData API (tenant URL + REST API key). Used by the
 * `authenticate`/`test` blocks and by `ivantiApiRequest`.
 */
export class IvantiNeuronsForItsmConnectorApi implements ICredentialType {
	name = 'ivantiNeuronsForItsmConnectorApi';
	icon: Icon = { light: 'file:../icons/synergy.svg', dark: 'file:../icons/synergy.dark.svg' };
	documentationUrl = 'https://www.synergy.eu';
	displayName = 'Ivanti Neurons for ITSM Connector API';
	properties: INodeProperties[] = [
		{
			displayName: 'Ensure the Ivanti Service Manager connector package is installed in the target system. Learn more <a href="https://www.synergy.eu" target="_blank">here</a>',
			name: 'moduleWarning',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'Ivanti Neurons for ITSM Tenant',
			name: 'tenant',
			type: 'string',
			default: '',
			required: true,
			description: 'The tenant hostname, e.g. sg-tenant.ivanti.com',
		},
		{
			displayName: 'Ivanti Neurons for ITSM API Key',
			name: 'apiKey',
			type: 'string',
			default: '',
			required: true,
			typeOptions: { password: true },
			description: 'The API key for the Ivanti instance. This is used to authenticate with the Ivanti API.',
		},
		{
			displayName: 'Is On Prem',
			name: 'isOnPrem',
			type: 'boolean',
			default: false,
			description: 'Whether the Ivanti instance is on-premises or cloud-based. If on-premises, the API base path will be /HEAT/api',
		},
		{
			displayName: 'Skip SSL Verification',
			name: 'skipSslVerification',
			type: 'boolean',
			default: false,
			description: 'Whether to skip SSL verification. This is useful for self-signed certificates.',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{ "rest_api_key=" + $credentials.apiKey }}',
			},
		},
	};
	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			baseURL: '={{ "https://" + $credentials.tenant.replace(/^https?:\\/\\//, "").replace(/\\/+$/, "") + ($credentials.isOnPrem ? "/HEAT" : "") + "/api/odata/businessobject" }}',
			url: '/N8N_AuthTypes',
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: { key: 'value[0].ReadOnly', value: true, message: 'Required module is not active.' },
			},
			{
				type: 'responseSuccessBody',
				properties: { key: 'value[0].ReadOnly', value: undefined, message: 'Required module is not active.' },
			},
		],
	};
}
```

**Step 2 — Reduce the existing credential to the inbound webhook concern only.** Edit `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts`: remove the outbound fields (lines 108-142) and the `authenticate`/`test` blocks (lines 145-180), keep only the webhook-auth fields. Since this credential is now purely a manually-read value store with nothing for n8n to test, it has no `authenticate`/`test`:

BEFORE (lines 22-28, top of class):
```typescript
export class IvantiNeuronsForItsmConnectorAuthApi implements ICredentialType {
	name = 'ivantiNeuronsForItsmConnectorAuthApi';
    icon: Icon = { light: 'file:../icons/synergy.svg', dark: 'file:../icons/synergy.dark.svg' };
    documentationUrl = 'https://www.synergy.eu';
    displayName = 'Ivanti Neurons for ITSM Connector Auth API';
    genericAuth = true;
    properties: INodeProperties[] = [
```

AFTER (keep name for backward compatibility on the inbound side; drop `genericAuth` since there is no `authenticate` block anymore):
```typescript
export class IvantiNeuronsForItsmConnectorAuthApi implements ICredentialType {
	name = 'ivantiNeuronsForItsmConnectorAuthApi';
    icon: Icon = { light: 'file:../icons/synergy.svg', dark: 'file:../icons/synergy.dark.svg' };
    documentationUrl = 'https://www.synergy.eu';
    displayName = 'Ivanti Neurons for ITSM Connector Webhook Auth';
    properties: INodeProperties[] = [
```

Then delete the outbound block — BEFORE (lines 106-142):
```typescript
        // Hostname (or host + path) of the Ivanti tenant, e.g. "acme.ivanticloud.com"
        {
            displayName: 'Ivanti Neurons for ITSM Tenant',
            name: 'tenant',
            ...
        },
        // ... apiKey, isOnPrem, skipSslVerification ...
        {
            displayName: 'Skip SSL Verification',
            name: 'skipSslVerification',
            type: 'boolean',
            default: false,
            description: 'Whether to skip SSL verification. This is useful for self-signed certificates.',
        }
    ];
```

AFTER:
```typescript
    ];
```

And remove the `authenticate` and `test` members (lines 145-180) entirely, plus the now-unused `ICredentialTestRequest` and `IAuthenticateGeneric` imports.

Also fix the inconsistency surfaced by the split: `webhookApiKey` (lines 91-105) is `required: true` while hidden for `type === 'base'`. Make it conditionally required by mode is not expressible directly, so the cleanest fix is to drop the unconditional `required: true` (its `displayOptions.show` already restricts it to `apiKey`/`header`) and rely on the runtime checks in `validateRequestAuth`:

BEFORE (lines 91-105):
```typescript
        {
            displayName: 'Webhook API Key',
            name: 'webhookApiKey',
            type: 'string',
            default: '',
            required: true,
            typeOptions: {
                password: true,
            },
            displayOptions: {
                show: { type: ['apiKey', 'header'] },
            },
            description: 'The API Key for the Webhook authentication.',
        },
```

AFTER:
```typescript
        {
            displayName: 'Webhook API Key',
            name: 'webhookApiKey',
            type: 'string',
            default: '',
            typeOptions: {
                password: true,
            },
            displayOptions: {
                show: { type: ['apiKey', 'header'] },
            },
            description: 'The API Key for the Webhook authentication.',
        },
```

**Step 3 — Repoint the outbound consumers to the new credential name.**

In `nodes/IvantiNeuronsForItsmConnector/transports/index.ts` (lines 32 and 47):

BEFORE:
```typescript
	const credential = await this.getCredentials('ivantiNeuronsForItsmConnectorAuthApi');
	...
	return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorAuthApi', options);
```

AFTER:
```typescript
	const credential = await this.getCredentials('ivantiNeuronsForItsmConnectorApi');
	...
	return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorApi', options);
```
(also update the JSDoc on line 15 which wrongly references `ivantiApiKeyApi` — it should name `ivantiNeuronsForItsmConnectorApi`.)

In `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`, `validateAutomationTransaction` (lines 338 and 354):

BEFORE:
```typescript
	const credentials = await this.getCredentials('ivantiNeuronsForItsmConnectorAuthApi');
	...
	const transaction = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorAuthApi', options) as IDataObject;
```

AFTER:
```typescript
	const credentials = await this.getCredentials('ivantiNeuronsForItsmConnectorApi');
	...
	const transaction = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorApi', options) as IDataObject;
```

`validateRequestAuth` (line 292) keeps reading `ivantiNeuronsForItsmConnectorAuthApi` (the now inbound-only credential) — leave it unchanged.

**Step 4 — Declare both credentials on the trigger node.** In `IvantiNeuronsForItsmConnectorTrigger.node.ts` (lines 52-57):

BEFORE:
```typescript
		credentials: [
			{
				name: 'ivantiNeuronsForItsmConnectorAuthApi',
				required: true,
			},
		],
```

AFTER:
```typescript
		credentials: [
			{
				name: 'ivantiNeuronsForItsmConnectorAuthApi',
				required: true,
			},
			{
				name: 'ivantiNeuronsForItsmConnectorApi',
				required: true,
			},
		],
```

**Step 5 — Register the new credential and bump version.** In `package.json`, add the compiled path to `n8n.credentials`:

```json
"credentials": [
  "dist/credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.js",
  "dist/credentials/IvantiNeuronsForItsmConnectorApi.credentials.js",
  "...existing other credential(s)..."
]
```
(Verify against the actual current array — keep the existing entries.) Because this is a breaking credential change, bump the major version and add a CHANGELOG.md entry per AGENTS.md ("If you are updating the npm package version, make sure to update CHANGELOG.md").

---

### Option 2 (minimal, non-breaking): one credential, but make the test honest and the UI segregated

If a breaking split is undesirable now:

1. Add `notice` separators inside `properties` to visually group "Inbound webhook authentication" vs. "Outbound Ivanti API connection" so the two concerns are not interleaved.
2. Keep the outbound `test` as-is, but document clearly in the field descriptions that the test only validates the outbound API key, not the inbound webhook auth (the test framework cannot exercise an inbound HTTP server).
3. Apply the `webhookApiKey` `required: true` fix from Step 2 above (drop the unconditional `required`).

Option 2 does not resolve the SRP/ISP violation; it only mitigates the misleading-test and UX symptoms. Prefer Option 1.

## Verification
1. Build/typecheck: run the project's build (`npm run build` or the `n8n-node build` CLI per AGENTS.md) and confirm no TypeScript errors after removing the unused `ICredentialTestRequest`/`IAuthenticateGeneric` imports and after repointing credential names.
2. Lint: run the project lint (`npm run lint` / `n8n-node lint`) — confirm zero new warnings, especially around unused imports and credential registration.
3. Grep check: confirm every outbound call site now uses the new name and only `validateRequestAuth` uses the inbound name:
   - `grep -rn "ivantiNeuronsForItsmConnectorApi" nodes credentials package.json`
   - `grep -rn "ivantiNeuronsForItsmConnectorAuthApi" nodes credentials package.json` — should only appear in the inbound credential class and `validateRequestAuth`.
4. Manual UI test in n8n: add the trigger node; confirm two credential pickers appear (Connector Webhook Auth + Connector API). Configure the API credential and click "Test" — it should succeed only when the outbound API key/tenant are valid. Configure the webhook credential with `type: header` and an empty `webhookApiKey`; verify the field is no longer flagged as unconditionally required when `type: base` is selected.
5. Functional test: POST a fake webhook with a wrong inbound token and confirm `400 Invalid Authorization` (proving `validateRequestAuth` still reads the inbound credential), then POST a valid token with a valid 32-char `x-transaction-id` and confirm the live transaction lookup uses the outbound credential.

## Related findings
None.
