# Finding 24: skipSslVerification disables TLS validation for all authenticated requests, exposing the API key to MITM

| Field | Value |
|---|---|
| Category | Security |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:42-48`, `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:135-142`, `nodes/IvantiNeuronsForITSM/transports/index.ts:53,171,210`, `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:45`, `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:344,352`, `README.md:190,1216` |

## Problem

Both credentials expose a `Skip SSL Verification` boolean whose value is forwarded as `skipSslCertificateValidation` on **every** authenticated outbound request — including OData calls that carry the REST API key in the `Authorization` header and the webhook validation call that uses the same credential.

The credential field carries a benign, single-sentence description that does not surface the actual blast radius:

`credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:42-48`
```ts
{
	displayName: 'Skip SSL Verification',
	name: 'skipSslVerification',
	type: 'boolean',
	default: false,
	description: 'Whether to skip SSL verification. This is useful for self-signed certificates.',
},
```

The same field (same description) exists in the Connector credential at `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:135-142`.

The flag is then wired into the request options across all transport helpers. In the main node's transport (`nodes/IvantiNeuronsForITSM/transports/index.ts`), it appears in `ivantiApiRequest` (line 53), `ivantiApiRequestFormData` (line 171), and `ivantiApiRequestBinary` (line 210):

`nodes/IvantiNeuronsForITSM/transports/index.ts:47-58`
```ts
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
```

The authenticate block injects the API key on every one of these requests (`credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:51-58`):
```ts
authenticate: IAuthenticateGeneric = {
	type: 'generic',
	properties: {
		headers: {
			Authorization: '={{ "rest_api_key=" + $credentials.apiKey }}',
		},
	},
};
```

The Connector transport does the same at `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:39-47`:
```ts
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

And the inbound webhook's transaction lookup at `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:344-354`:
```ts
const skipSslVerification = credentials.skipSslVerification as boolean;
// On-prem deployments expose the API under the /HEAT virtual directory
const baseUrl = `https://${tenant}${isOnPrem ? '/HEAT' : ""}/api`;
const url = `${baseUrl}/odata/businessobject/IVNT_Automation_Transactionss('${headers['x-transaction-id']}')`;
const options: IHttpRequestOptions = {
	method: 'GET',
	url: url,
	json: false,
	skipSslCertificateValidation: skipSslVerification,
};
const transaction = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorAuthApi', options) as IDataObject;
```

The README reinforces the casual framing: it labels the field "Disable SSL cert validation" with `false (recommended)` (line 190) and, in the troubleshooting section, advises simply enabling it for self-signed certificates (line 1216) with no warning.

## Why it matters

`skipSslCertificateValidation: true` turns off certificate-chain and hostname verification for the entire connection. Because the API key (`Authorization: rest_api_key=…`) — and, on the Connector side, the Basic Auth / pre-shared header secrets that protect the webhook — ride on these same connections, any on-path attacker can present an arbitrary certificate, terminate the TLS session, and read the credential in cleartext (a classic MITM). The captured REST API key grants full programmatic access to the Ivanti ITSM tenant.

The risk is most acute precisely where users are nudged to enable the flag: on-prem instances with self-signed certs. The current field copy ("useful for self-signed certificates") makes the toggle look like a harmless convenience and hides that it sacrifices the confidentiality of the credential itself. The default is correctly `false`, so this is a hardening / disclosure issue rather than an exploit-by-default, which is why it is medium rather than high.

## Resolution

Goal: keep the existing behavior and default (`false`) but make the danger explicit at the point of decision (the credential field) and in the README. No runtime code change is strictly required; the transports already default to whatever the user set. The changes below are documentation/UX hardening. (A CA-bundle / cert-pinning alternative is noted as optional follow-up.)

### Step 1 — Strengthen the field description in the API Key credential

File: `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:42-48`

BEFORE:
```ts
{
	displayName: 'Skip SSL Verification',
	name: 'skipSslVerification',
	type: 'boolean',
	default: false,
	description: 'Whether to skip SSL verification. This is useful for self-signed certificates.',
},
```

AFTER:
```ts
{
	displayName: 'Skip SSL Verification',
	name: 'skipSslVerification',
	type: 'boolean',
	default: false,
	description:
		'Whether to disable TLS certificate validation for ALL requests made with this credential. ' +
		'Leave this off. When enabled, an on-path (man-in-the-middle) attacker can intercept the ' +
		'connection and steal your API key, because the key is sent on every request. ' +
		'For self-signed certificates, install the issuing CA on the n8n host instead of enabling this.',
},
```

### Step 2 — Apply the same description to the Connector credential

File: `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:136-142`

BEFORE:
```ts
		{
			displayName: 'Skip SSL Verification',
			name: 'skipSslVerification',
			type: 'boolean',
			default: false,
			description: 'Whether to skip SSL verification. This is useful for self-signed certificates.',
		}
```

AFTER:
```ts
		{
			displayName: 'Skip SSL Verification',
			name: 'skipSslVerification',
			type: 'boolean',
			default: false,
			description:
				'Whether to disable TLS certificate validation for ALL outbound requests made with this credential. ' +
				'Leave this off. When enabled, an on-path (man-in-the-middle) attacker can intercept the ' +
				'connection and steal your API key (and the webhook secrets stored here), because they are sent on ' +
				'every request. For self-signed certificates, install the issuing CA on the n8n host instead of enabling this.',
		}
```

### Step 3 — Add a warning notice next to the toggle (optional but recommended UX)

n8n supports `type: 'notice'` fields (already used in the Connector credential at line 30-34 for `moduleWarning`). Add one directly above each `skipSslVerification` field so the warning is visible without hovering the description.

For `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts`, insert before the `Skip SSL Verification` object (line 42):
```ts
		{
			displayName:
				'Security warning: enabling "Skip SSL Verification" disables TLS validation and can expose your API key to man-in-the-middle attackers. Prefer installing the Ivanti CA certificate on the n8n host.',
			name: 'skipSslVerificationWarning',
			type: 'notice',
			default: '',
			displayOptions: { show: { skipSslVerification: [true] } },
		},
```

Add the analogous notice (object identical, with a `name` like `skipSslVerificationWarning`) before line 136 in `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts`. The `displayOptions.show` makes the notice appear only once the user actually enables the toggle.

### Step 4 — Document the risk in the README

File: `README.md`

4a. Update the credential table row (line 190):

BEFORE:
```
| **Skip SSL Verification** | boolean | Disable SSL cert validation | `false` (recommended) |
```

AFTER:
```
| **Skip SSL Verification** | boolean | Disables TLS validation for all requests with this credential. Exposes the API key to MITM — leave off; install the Ivanti CA instead. | `false` (strongly recommended) |
```

4b. Replace the casual advice in the "SSL Certificate Errors" section (lines 1215-1219):

BEFORE:
```
**Solutions**:
- For self-signed certificates: enable "Skip SSL Verification"
- For production: install proper SSL certificate on Ivanti
- Check certificate expiration date
- Verify certificate chain is complete
```

AFTER:
```
**Solutions** (in order of preference):
- Install a proper, CA-signed certificate on the Ivanti instance.
- For self-signed certificates, add the issuing CA to the n8n host's trust store
  (e.g. via `NODE_EXTRA_CA_CERTS`) so validation succeeds without weakening security.
- Only as a last resort, enable "Skip SSL Verification" — be aware this disables TLS
  validation for every request made with the credential and can expose your API key
  to man-in-the-middle attackers. Never use it over untrusted networks or in production.
- Check certificate expiration date and that the certificate chain is complete.
```

4c. Update the FAQ answer at line 1506 (`A: Enable "Skip SSL Verification" in credentials. For production, install proper SSL certificate.`) to lead with the CA-install approach and warn that the skip flag exposes the API key to MITM.

### Step 5 (optional follow-up, not required to close this finding)

Offer a safer alternative to a blanket skip: a `ca` (PEM bundle) string field on the credential, plugged into `IHttpRequestOptions` so users can trust a specific self-signed CA instead of disabling validation entirely. This is a larger change touching every transport helper (`ivantiApiRequest`, `ivantiApiRequestFormData`, `ivantiApiRequestBinary`, the Connector `ivantiApiRequest`, and the webhook lookup in `IvantiNeuronsForItsmConnectorTrigger.node.ts`) and can be deferred.

## Verification

1. Build/lint to confirm the credential edits compile and pass the project linter:
   - `npx n8n-node lint` (or the repo's configured `npm run lint`)
   - `npx n8n-node build` (or `npm run build`) — confirms the credential `.ts` files still typecheck.
2. Manual check in the n8n UI: open both "Ivanti Neurons for ITSM API" and "Ivanti Neurons for ITSM Connector Auth API" credentials and confirm the new description text renders on the `Skip SSL Verification` field, the default is still off, and (if Step 3 applied) the warning notice appears only after toggling it on.
3. Confirm no behavioral regression: the `skipSslCertificateValidation` wiring in `nodes/IvantiNeuronsForITSM/transports/index.ts` (lines 53, 171, 210), `nodes/IvantiNeuronsForItsmConnector/transports/index.ts` (line 45), and `IvantiNeuronsForItsmConnectorTrigger.node.ts` (line 352) is unchanged, so requests behave identically for existing users.
4. Render the README locally and verify lines 190, 1215-1219, and 1506 reflect the new warnings.
5. Per AGENTS.md, if a package version bump accompanies these changes, add a corresponding entry to `CHANGELOG.md`.

## Related findings

None.
