# Finding 12: Tenant normalization + base-URL building duplicated across 5+ sites, with the connector trigger missing normalization

| Field | Value |
|---|---|
| Category | DRY / Duplication |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/transports/index.ts:44-56`, `nodes/IvantiNeuronsForITSM/transports/index.ts:163-172`, `nodes/IvantiNeuronsForITSM/transports/index.ts:202-214`, `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:36-47`, `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:342-346` |

## Problem
The same five-ish lines that read the credential, strip protocol/trailing-slash from the tenant, compute the on-prem `/HEAT/api` path prefix, and build the request URL are copy-pasted across five locations. Three of them are identical, character for character.

`nodes/IvantiNeuronsForITSM/transports/index.ts:44-51` (`ivantiApiRequest`):

```ts
const tenant = (credential.tenant as string).replace(/^https?:\/\//, '').replace(/\/+$/, '');
const isOnPrem = credential.isOnPrem as boolean;
const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
const options: IHttpRequestOptions = {
	method,
	qs,
	body,
	url: `https://${tenant}${tenantPath}${endpoint}`,
```

The exact same three normalization lines reappear at `index.ts:163-165` (`ivantiApiRequestFormData`) and `index.ts:202-204` (`ivantiApiRequestBinary`), and again in the connector transport at `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:36-38`.

The critical divergence is in the connector trigger. `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:342-346` reimplements the URL build inline **without** normalizing the tenant:

```ts
const tenant = credentials.tenant as string;
const isOnPrem = credentials.isOnPrem as boolean;
const skipSslVerification = credentials.skipSslVerification as boolean;
// On-prem deployments expose the API under the /HEAT virtual directory
const baseUrl = `https://${tenant}${isOnPrem ? '/HEAT' : ""}/api`;
```

Note there is **no** `.replace(/^https?:\/\//, '').replace(/\/+$/, '')` here, unlike every other call site. (This node imports only from `n8n-workflow` — it pulls in no transport helper — so it has its own private copy of the logic.)

A second, related inconsistency: error/status handling is also copy-divergent. Only `ivantiApiRequest` sets `ignoreHttpStatusErrors: true` and maps non-2xx responses to a `NodeOperationError` (`index.ts:55, 59-62`):

```ts
returnFullResponse: true,
ignoreHttpStatusErrors : true
};
const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
if(response.statusCode < 200 || response.statusCode >= 300){
	const error = response.body as IVantiApiError;
	throw new NodeOperationError(this.getNode(), error.message.join(', '));
}
```

`ivantiApiRequestFormData` (`index.ts:166-173`), `ivantiApiRequestBinary` (`index.ts:205-214`), the connector transport (`Connector/transports/index.ts:39-47`), and `validateAutomationTransaction` (`ConnectorTrigger.node.ts:348-354`) all omit both `ignoreHttpStatusErrors` and the status-to-`NodeOperationError` mapping.

## Why it matters
- **Broken URL for a subset of users (runtime failure).** The credential field is documented as a hostname (`placeholder: 'sg-tenant.ivanti.com'`, `ivantiNeuronsForItsmApiKeyApi.credentials.ts:20`), but users routinely paste the full URL they copied from a browser, e.g. `https://acme.ivanticloud.com/`. Every other code path silently corrects this via the two `.replace()` calls. The connector trigger does not, so `validateAutomationTransaction` builds `https://https://acme.ivanticloud.com//api/odata/...`, which fails. Because validation runs on the inbound webhook before the payload is processed, this makes the trigger reject every legitimate Ivanti automation transaction for those users, while the rest of their workflow (which uses the normalized paths) appears to work — a confusing, hard-to-diagnose failure.
- **Maintainability / drift.** The normalization regex and the `/HEAT/api` rule are duplicated in 5 source sites (plus twice more as `={{ ... }}` expressions in both credential files, `ivantiNeuronsForItsmApiKeyApi.credentials.ts:62` and `IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:159`). The trigger already proves the cost: one copy drifted. Any future change to the URL scheme (new path segment, different on-prem rule) must be made in all of them, and the next omission is just as silent.
- **Inconsistent error surfaces.** A failed upload/download/connector call returns the raw HTTP layer error instead of the friendly, Ivanti-specific message that `ivantiApiRequest` produces from `IVantiApiError.message`. Users get a different (worse) error depending on which operation they ran.

## Resolution
Create one shared helper module per node package that owns tenant normalization, base-URL building, and error mapping, then have every request variant and the trigger consume it.

### 1. Create the shared helper for the main node

New file `nodes/IvantiNeuronsForITSM/transports/url.ts`:

```ts
import {
	NodeOperationError,
	type IDataObject,
	type ICredentialDataDecryptedObject,
	type IExecuteFunctions,
	type IExecuteSingleFunctions,
	type IHookFunctions,
	type ILoadOptionsFunctions,
	type IPollFunctions,
	type ITriggerFunctions,
} from 'n8n-workflow';

/** Ivanti error payload returned on non-2xx responses. */
export interface IVantiApiError {
	code: string;
	description: string;
	message: string[];
	help: string;
}

type IvantiThis =
	| IExecuteFunctions
	| IExecuteSingleFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| ITriggerFunctions
	| IPollFunctions;

/** Strip any protocol prefix and trailing slashes from a user-entered tenant value. */
export function normalizeTenant(tenant: string): string {
	return tenant.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/**
 * Builds the API base URL from a credential.
 * On-prem instances expose the API under the /HEAT virtual directory.
 *
 * @param credential - decrypted credential containing `tenant` and `isOnPrem`
 * @param endpoint   - API path starting with `/` (default `''`)
 */
export function buildBaseUrl(
	credential: ICredentialDataDecryptedObject,
	endpoint = '',
): string {
	const tenant = normalizeTenant(credential.tenant as string);
	const tenantPath = (credential.isOnPrem as boolean) ? '/HEAT/api' : '/api';
	return `https://${tenant}${tenantPath}${endpoint}`;
}

/**
 * Maps a non-2xx full response to an Ivanti-friendly NodeOperationError.
 * No-op for 2xx responses.
 */
export function throwOnApiError(
	ctx: IvantiThis,
	response: { statusCode: number; body: unknown },
): void {
	if (response.statusCode < 200 || response.statusCode >= 300) {
		const error = response.body as IVantiApiError;
		const message =
			Array.isArray(error?.message) && error.message.length > 0
				? error.message.join(', ')
				: `Ivanti API request failed with status ${response.statusCode}`;
		throw new NodeOperationError(ctx.getNode(), message);
	}
}
```

### 2. Refactor `nodes/IvantiNeuronsForITSM/transports/index.ts`

Move the `IVantiApiError` interface out (it now lives in `url.ts`) and import the helpers. Apply to all three request functions.

BEFORE (`ivantiApiRequest`, lines 44-62):

```ts
const tenant = (credential.tenant as string).replace(/^https?:\/\//, '').replace(/\/+$/, '');
const isOnPrem = credential.isOnPrem as boolean;
const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
const options: IHttpRequestOptions = {
	method,
	qs,
	body,
	url: `https://${tenant}${tenantPath}${endpoint}`,
	json: false,
	skipSslCertificateValidation: credential.skipSslVerification as boolean,
	returnFullResponse: true,
	ignoreHttpStatusErrors : true
};

const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
if(response.statusCode < 200 || response.statusCode >= 300){
	const error = response.body as IVantiApiError;
	throw new NodeOperationError(this.getNode(), error.message.join(', '));
}

return response.body;
```

AFTER:

```ts
const options: IHttpRequestOptions = {
	method,
	qs,
	body,
	url: buildBaseUrl(credential, endpoint),
	json: false,
	skipSslCertificateValidation: credential.skipSslVerification as boolean,
	returnFullResponse: true,
	ignoreHttpStatusErrors: true,
};

const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
throwOnApiError(this, response);

return response.body;
```

BEFORE (`ivantiApiRequestFormData`, lines 163-173):

```ts
const tenant = (credential.tenant as string).replace(/^https?:\/\//, '').replace(/\/+$/, '');
const isOnPrem = credential.isOnPrem as boolean;
const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
const options: IHttpRequestOptions = {
	method,
	url: `https://${tenant}${tenantPath}${endpoint}`,
	body: formData,
	json: false,
	skipSslCertificateValidation: credential.skipSslVerification as boolean,
};
return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
```

AFTER (note: to also gain consistent error mapping, set `returnFullResponse: true`, run `throwOnApiError`, then return the body):

```ts
const options: IHttpRequestOptions = {
	method,
	url: buildBaseUrl(credential, endpoint),
	body: formData,
	json: false,
	skipSslCertificateValidation: credential.skipSslVerification as boolean,
	returnFullResponse: true,
	ignoreHttpStatusErrors: true,
};
const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
throwOnApiError(this, response);
return response.body;
```

(If form-data callers currently rely on the raw response object rather than the body, keep `returnFullResponse: true` and return `response` instead — but apply `throwOnApiError(this, response)` before returning either way. Verify against `actions/attachment/uploadAttachment.operation.ts`, the only caller, before changing the return shape.)

BEFORE (`ivantiApiRequestBinary`, lines 202-214):

```ts
const tenant = (credential.tenant as string).replace(/^https?:\/\//, '').replace(/\/+$/, '');
const isOnPrem = credential.isOnPrem as boolean;
const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
const options: IHttpRequestOptions = {
	method,
	body,
	url: `https://${tenant}${tenantPath}${endpoint}`,
	json: false,
	skipSslCertificateValidation: credential.skipSslVerification as boolean,
	returnFullResponse: true,

};
return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
```

AFTER (binary callers need the full response for headers, so keep returning the full response, but add status checking):

```ts
const options: IHttpRequestOptions = {
	method,
	body,
	url: buildBaseUrl(credential, endpoint),
	json: false,
	skipSslCertificateValidation: credential.skipSslVerification as boolean,
	returnFullResponse: true,
	ignoreHttpStatusErrors: true,
};
const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
throwOnApiError(this, response);
return response;
```

Add the import at the top of `index.ts`:

```ts
import { buildBaseUrl, throwOnApiError } from './url';
```

Delete the now-duplicated `IVantiApiError` interface at `index.ts:218-223` (it now lives in `url.ts`); update any importer to import it from `./transports/url` instead. (Grep shows the only in-repo reference to `IVantiApiError` is inside `index.ts` itself, so no external importer needs updating.)

### 3. Create the same helper for the connector node and refactor its transport

The two node packages do not share code, so add a parallel `nodes/IvantiNeuronsForItsmConnector/transports/url.ts` with the same `normalizeTenant` / `buildBaseUrl` / `throwOnApiError` functions (identical body). Then in `nodes/IvantiNeuronsForItsmConnector/transports/index.ts`:

BEFORE (lines 36-47):

```ts
const tenant = (credential.tenant as string).replace(/^https?:\/\//, '').replace(/\/+$/, '');
const isOnPrem = credential.isOnPrem as boolean;
const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
const options: IHttpRequestOptions = {
	method,
	qs,
	body,
	url: `https://${tenant}${tenantPath}${endpoint}`,
	json: false,
	skipSslCertificateValidation: credential.skipSslVerification as boolean,
};
return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorAuthApi', options);
```

AFTER:

```ts
const options: IHttpRequestOptions = {
	method,
	qs,
	body,
	url: buildBaseUrl(credential, endpoint),
	json: false,
	skipSslCertificateValidation: credential.skipSslVerification as boolean,
	returnFullResponse: true,
	ignoreHttpStatusErrors: true,
};
const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorAuthApi', options);
throwOnApiError(this, response);
return response.body;
```

Add `import { NodeOperationError } from 'n8n-workflow';` if you keep `throwOnApiError` inline, but here it is encapsulated in `url.ts`, so just `import { buildBaseUrl, throwOnApiError } from './url';`. Verify the two connector callers (`actions/automation/update.operation.ts:93, 111`) still work with `response.body` (they currently consume the return value directly, so they will).

### 4. Fix the connector trigger (the bug)

`nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`.

BEFORE (lines 342-347):

```ts
const tenant = credentials.tenant as string;
const isOnPrem = credentials.isOnPrem as boolean;
const skipSslVerification = credentials.skipSslVerification as boolean;
// On-prem deployments expose the API under the /HEAT virtual directory
const baseUrl = `https://${tenant}${isOnPrem ? '/HEAT' : ""}/api`;
const url = `${baseUrl}/odata/businessobject/IVNT_Automation_Transactionss('${headers['x-transaction-id']}')`;
```

AFTER (reuse the shared helper so normalization can never drift again):

```ts
const skipSslVerification = credentials.skipSslVerification as boolean;
const url = buildBaseUrl(
	credentials,
	`/odata/businessobject/IVNT_Automation_Transactionss('${headers['x-transaction-id']}')`,
);
```

Add the import near the top of the file (it currently imports only from `n8n-workflow`):

```ts
import { buildBaseUrl } from './transports/url';
```

`buildBaseUrl(credentials, endpoint)` already prepends `/api` (or `/HEAT/api`) exactly like the old code intended, so the resulting URL is unchanged for well-formed tenants and now also correct for tenants pasted with an `https://` prefix or trailing slash.

> Note: `getCredentials` returns `ICredentialDataDecryptedObject`, which is the type `buildBaseUrl` accepts, so no cast is needed at the trigger call site.

### 5. (Optional, lower priority) De-duplicate the credential expressions
Both credential files embed the same normalization in a `={{ ... }}` `baseURL` expression (`ivantiNeuronsForItsmApiKeyApi.credentials.ts:62`, `IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:159`). These are n8n expression strings and cannot import the TS helper, so they must stay as-is, but flag them in a comment that references `transports/url.ts` so future edits keep all four copies in sync.

## Verification
1. Build / typecheck and lint (per AGENTS.md, prefer the CLI):
   - `npx n8n-node build` (or the project's configured build) — must compile with no TS errors after the `IVantiApiError` move and new imports.
   - `npx n8n-node lint` (or `npx eslint .`) — no new warnings.
2. Confirm no remaining inline duplication:
   - `grep -rn "replace(/\^https" nodes/` should now only match the two credential `.credentials.ts` expression strings (step 5), not any `.node.ts` / `transports/index.ts` files.
   - `grep -rn "/HEAT/api" nodes/` should only match `transports/url.ts` (one per package).
3. Manual / behavioral check of the bug fix: configure the connector credential with a tenant entered as `https://<host>/` (with protocol and trailing slash), send a webhook with a valid 32-char `x-transaction-id`, and confirm `validateAutomationTransaction` now hits `https://<host>/api/odata/businessobject/...` (or `/HEAT/api/...` when on-prem) instead of the malformed `https://https://<host>//api/...`. Before the fix this call fails; after the fix it resolves identically to the main node's requests.
4. Regression-check the attachment upload/download operations (`uploadAttachment.operation.ts`, `readAttachment.operation.ts`) still succeed, since their transport functions changed return/error behavior.

## Related findings
None.
