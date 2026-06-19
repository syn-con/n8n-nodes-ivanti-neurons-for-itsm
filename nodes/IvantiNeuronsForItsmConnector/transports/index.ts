import {
	ITriggerFunctions,
	type IDataObject,
	type IExecuteFunctions,
	type IExecuteSingleFunctions,
	type IHookFunctions,
	type IHttpRequestMethods,
	type ILoadOptionsFunctions,
	type IHttpRequestOptions,
	type ICredentialDataDecryptedObject,
	IPollFunctions,
	NodeOperationError,
} from 'n8n-workflow';
/**
 * Makes a single authenticated HTTP request to the Ivanti Neurons for ITSM REST/OData API.
 *
 * Reads the `ivantiApiKeyApi` credential to determine the tenant hostname, whether the
 * instance is on-premises (HEAT path prefix), and whether to skip SSL verification.
 *
 * @param method   - HTTP method (GET, POST, PUT, PATCH, DELETE, …)
 * @param endpoint - API path starting with `/`, e.g. `/odata/businessobject/Incidents`
 * @param qs       - OData / query-string parameters appended to the URL
 * @param body     - JSON request body (omit or pass `undefined` for GET/DELETE)
 * @returns Raw response from `httpRequestWithAuthentication`
 */
export async function ivantiApiRequest(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined,
) {

	const credential = await this.getCredentials('ivantiNeuronsForItsmConnectorAuthApi');
	if (credential === undefined) {
		throw new NodeOperationError(this.getNode(), 'No credentials got returned!');
	}
	const url = buildBaseUrl(credential, endpoint);
	const options: IHttpRequestOptions = {
		method,
		qs,
		body,
		url: url,
		json: false,
		skipSslCertificateValidation: credential.skipSslVerification as boolean,
	};
	return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmConnectorAuthApi', options);
}




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

