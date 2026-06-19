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
import { SearchResponse } from '../common';

/** Maximum number of records fetched in a single OData page request. */
const ODATA_BATCH_SIZE = 100;


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
	body: IDataObject | undefined = undefined,
) {


	const credential = await this.getCredentials('ivantiNeuronsForItsmApiKeyApi');
	if (credential === undefined) {
		throw new Error('No credentials got returned!');
	}

	const url = buildBaseUrl(credential, endpoint);

	const options: IHttpRequestOptions = {
		method,
		qs,
		body,
		url: url,
		json: false,
		skipSslCertificateValidation: credential.skipSslVerification as boolean,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true
	};

	const response = await this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
	if (response.statusCode < 200 || response.statusCode >= 300) {
		throw new NodeOperationError(
			this.getNode(),
			buildIvantiErrorMessage(response.statusCode, response.body),
		);
	}
	return parseJsonBody(response.body);
}

/**
 * Normalizes a response body into a parsed value.
 *
 * Because requests are issued with `json: false`, n8n returns the raw response
 * body as a string. OData endpoints return JSON, so we parse it here so callers
 * receive an object (e.g. `{ value: [...] }`) rather than a string. Non-JSON or
 * empty bodies are returned unchanged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonBody(body: unknown): any {
	if (typeof body !== 'string') {
		return body;
	}
	const trimmed = body.trim();
	if (trimmed === '') {
		return body;
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		return body;
	}
}

/**
 * Safely extracts the `value` array from an OData list response.
 * Throws a clear error if the response is not the expected `{ value: [...] }`
 * envelope, instead of letting a spread of `undefined` fail with an opaque
 * "is not iterable" message.
 */
function extractValueArray(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	response: SearchResponse,
): IDataObject[] {
	// An empty body (e.g. HTTP 204 No Content, or a blank 200) means there are
	// no records / no further pages — treat it as an empty result set.
	if (response === undefined || response === null || (response as unknown) === '') {
		return [];
	}
	if (Array.isArray(response.value)) {
		return response.value;
	}
	throw new NodeOperationError(
		this.getNode(),
		'Unexpected Ivanti API response: expected an OData list with a "value" array',
		{ description: `Received: ${JSON.stringify(response)?.slice(0, 500)}` },
	);
}

/**
 * Fetches up to `limit` records from an OData endpoint, paging automatically in
 * batches of `ODATA_BATCH_SIZE` until the limit is reached or the server has no
 * more records to return.
 *
 * @param method   - HTTP method (typically GET)
 * @param endpoint - OData collection path
 * @param qs       - Additional OData query parameters (`$filter`, `$select`, …)
 * @param body     - Optional request body
 * @param limit    - Maximum total records to return (default 100)
 * @returns Flat array of record objects
 */
export async function ivantiApiRequestAllItemsWithLimit(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
	limit: number = 100,
) {
	const returnData: IDataObject[] = [];
	let skip = 0;

	while (returnData.length < limit) {
		const remaining = limit - returnData.length;
		qs["$top"] = Math.min(remaining, ODATA_BATCH_SIZE);
		qs["$skip"] = skip;

		const response = await ivantiApiRequest.call(this, method, endpoint, qs, body) as SearchResponse;
		const value = extractValueArray.call(this, response);
		returnData.push(...value);
		skip += value.length;

		if (value.length < ODATA_BATCH_SIZE) {
			break;
		}
	}

	return returnData;
}


/**
 * Fetches **all** records from an OData endpoint by first requesting the total count
 * (`@odata.count`) and then paging through the full result set in batches of
 * `ODATA_BATCH_SIZE`.
 *
 * @param method   - HTTP method (typically GET)
 * @param endpoint - OData collection path
 * @param qs       - Additional OData query parameters (`$filter`, `$select`, …)
 * @param body     - Optional request body
 * @returns Flat array of all matching record objects
 */
export async function ivantiApiRequestAllItems(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
) {
	const returnData: IDataObject[] = [];
	let skip = 0;

	// Page until the server returns a partial (short) page, which signals the
	// end of the result set. This does not rely on the @odata.count annotation,
	// which the server omits unless $count=true is explicitly requested.
	for (; ;) {
		qs["$top"] = ODATA_BATCH_SIZE;
		qs["$skip"] = skip;

		const response = await ivantiApiRequest.call(this, method, endpoint, qs, body) as SearchResponse;
		const value = extractValueArray.call(this, response);
		returnData.push(...value);
		skip += value.length;

		if (value.length < ODATA_BATCH_SIZE) {
			break;
		}
	}

	return returnData;
}


/**
 * Single decision point for the returnAll / limit / >batch-size fetch strategy
 * that is currently re-implemented in getMany, searchByKeyword and the trigger.
 */
export async function fetchRecords(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions,
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
	return extractValueArray.call(this, response);
}



/**
 * Makes an authenticated multipart/form-data request to the Ivanti API.
 * Used exclusively for file upload operations (e.g. `POST /rest/Attachment`).
 *
 * @param method   - HTTP method (typically POST)
 * @param endpoint - API path
 * @param formData - Browser-compatible `FormData` object containing file and metadata fields
 * @returns Raw API response
 */
export async function ivantiApiRequestFormData(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	formData: FormData,
) {
	const credential = await this.getCredentials('ivantiNeuronsForItsmApiKeyApi');
	if (credential === undefined) {
		throw new Error('No credentials got returned!');
	}
	const url = buildBaseUrl(credential, endpoint);
	const options: IHttpRequestOptions = {
		method,
		url: url,
		body: formData,
		json: false,
		skipSslCertificateValidation: credential.skipSslVerification as boolean,
	};
	return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
}

/**
 * Makes an authenticated request that returns the **full HTTP response** (headers + body),
 * required when downloading binary content such as attachment files.
 *
 * Sets `returnFullResponse: true` so callers can inspect `response.headers` (e.g.
 * `Content-Disposition`) and stream `response.body` into n8n binary data.
 *
 * @param method   - HTTP method (typically GET)
 * @param endpoint - API path
 * @param body     - Optional request body
 * @returns Full HTTP response object including `headers` and `body`
 */
export async function ivantiApiRequestBinary(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
) {

	const credential = await this.getCredentials('ivantiNeuronsForItsmApiKeyApi');

	if (credential === undefined) {
		throw new Error('No credentials got returned!');
	}
	const url = buildBaseUrl(credential, endpoint);
	const options: IHttpRequestOptions = {
		method,
		body,
		url: url,
		json: false,
		// Return the raw bytes as a Buffer. Without this, n8n/axios auto-parses
		// the response (e.g. a numeric-looking body becomes a number), which then
		// fails in prepareBinaryData with "data must be of type string or Buffer".
		encoding: 'arraybuffer',
		skipSslCertificateValidation: credential.skipSslVerification as boolean,
		returnFullResponse: true,

	};
	return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
}

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



export interface IvantiApiError {
	message?: string | string[];
	error?: { code?: string; message?: string };
}

