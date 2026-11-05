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
	type JsonObject,
	IPollFunctions,
	NodeApiError,
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
 * @param headers  - Extra headers; each one replaces a default header of the same name
 * @returns Raw response from `sendRequest`
 */
export async function ivantiApiRequest(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
	headers: IDataObject = {},
) {


	const credential = await this.getCredentials('ivantiNeuronsForItsmApiKeyApi');
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
		returnFullResponse: true,
		ignoreHttpStatusErrors: true
	};
	applyHeaders(options, headers);

	const response = await sendRequest.call(this, options);
	if (isFailure(response)) {
		throw ivantiApiError.call(this, response, parseJsonBody(response.body));
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
		// Not all endpoints return JSON (e.g. plain-text or HTML responses). A
		// parse failure is expected for those, so we return the raw body unchanged
		// and let the caller handle the non-JSON payload rather than failing here.
		return body;
	}
}

/**
 * Safely extracts the `value` array from an OData list response.
 * Throws a clear error if the response is not the expected `{ value: [...] }`
 * envelope, instead of letting a spread of `undefined` fail with an opaque
 * "is not iterable" message.
 */
export function extractValueArray(
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
 * @param headers  - Extra headers sent with every page request
 * @returns Flat array of record objects
 */
export async function ivantiApiRequestAllItemsWithLimit(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
	limit: number = 100,
	headers: IDataObject = {},
) {
	const returnData: IDataObject[] = [];
	let skip = 0;

	while (returnData.length < limit) {
		const remaining = limit - returnData.length;
		qs["$top"] = Math.min(remaining, ODATA_BATCH_SIZE);
		qs["$skip"] = skip;

		const response = await ivantiApiRequest.call(this, method, endpoint, qs, body, headers) as SearchResponse;
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
 * @param headers  - Extra headers sent with every page request
 * @returns Flat array of all matching record objects
 */
export async function ivantiApiRequestAllItems(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
	headers: IDataObject = {},
) {
	const returnData: IDataObject[] = [];
	let skip = 0;

	// Page until the server returns a partial (short) page, which signals the
	// end of the result set. This does not rely on the @odata.count annotation,
	// which the server omits unless $count=true is explicitly requested.
	for (; ;) {
		qs["$top"] = ODATA_BATCH_SIZE;
		qs["$skip"] = skip;

		const response = await ivantiApiRequest.call(this, method, endpoint, qs, body, headers) as SearchResponse;
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
	options: { returnAll: boolean; limit?: number; headers?: IDataObject },
): Promise<IDataObject[]> {
	const headers = options.headers ?? {};
	if (options.returnAll) {
		return ivantiApiRequestAllItems.call(this, 'GET', endpoint, qs, undefined, headers);
	}
	const limit = options.limit ?? 100;
	if (limit > ODATA_BATCH_SIZE) {
		return ivantiApiRequestAllItemsWithLimit.call(this, 'GET', endpoint, qs, undefined, limit, headers);
	}
	qs['$top'] = limit;
	const response = (await ivantiApiRequest.call(this, 'GET', endpoint, qs, {}, headers)) as SearchResponse;
	return extractValueArray.call(this, response);
}



/**
 * Makes an authenticated multipart/form-data request to the Ivanti API.
 * Used exclusively for file upload operations (e.g. `POST /rest/Attachment`).
 *
 * @param method   - HTTP method (typically POST)
 * @param endpoint - API path
 * @param formData - Browser-compatible `FormData` object containing file and metadata fields
 * @param headers  - Extra headers; each one replaces a default header of the same name
 * @returns Raw API response
 */
export async function ivantiApiRequestFormData(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	formData: FormData,
	headers: IDataObject = {},
) {
	const credential = await this.getCredentials('ivantiNeuronsForItsmApiKeyApi');
	if (credential === undefined) {
		throw new NodeOperationError(this.getNode(), 'No credentials got returned!');
	}
	const url = buildBaseUrl(credential, endpoint);
	const options: IHttpRequestOptions = {
		method,
		url: url,
		body: formData,
		json: false,
		skipSslCertificateValidation: credential.skipSslVerification as boolean,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	applyHeaders(options, headers);

	const response = await sendRequest.call(this, options);
	if (isFailure(response)) {
		throw ivantiApiError.call(this, response, parseJsonBody(response.body));
	}
	return parseJsonBody(response.body);
}

/** True for any answer outside 2xx. Every helper sends `ignoreHttpStatusErrors` and checks this. */
function isFailure(response: { statusCode: number }): boolean {
	return response.statusCode < 200 || response.statusCode >= 300;
}

/**
 * The error for a refused request, shared by every request helper: Ivanti's own
 * message and error code (e.g. ISM_4000), the HTTP status, and the reply body in
 * the description. For an upload, the reasons of each refused file are listed.
 *
 * @param body - The reply body, already parsed (or text when it is not JSON)
 */
function ivantiApiError(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	response: { statusCode: number; headers?: unknown },
	body: unknown,
): NodeApiError {
	const failures = extractUploadFailures(body);
	return new NodeApiError(
		this.getNode(),
		{ statusCode: response.statusCode, headers: response.headers, body } as JsonObject,
		{
			message:
				failures.length > 0
					? `${errorPrefix(response.statusCode, body)}: ${failures.join('; ')}`
					: buildIvantiErrorMessage(response.statusCode, body),
			description: describeBody(body),
			httpCode: String(response.statusCode),
		},
	);
}

/**
 * Pulls readable failure reasons out of an attachment upload reply. Ivanti
 * answers a rejected upload with HTTP 300 (ISM_3000 "Validation Error") and a
 * `Message` that is either a list of strings or a list of per-file results
 * (`{ FileName, IsUploaded, Message }`). The per-file list may also be the
 * whole body.
 */
function extractUploadFailures(body: unknown): string[] {
	const list = Array.isArray(body)
		? body
		: body && typeof body === 'object' && Array.isArray((body as IDataObject).Message)
			? ((body as IDataObject).Message as unknown[])
			: [];
	const reasons: string[] = [];
	for (const entry of list) {
		if (typeof entry === 'string') {
			reasons.push(entry);
		} else if (entry && typeof entry === 'object') {
			const file = entry as IDataObject;
			if (file.IsUploaded === false) {
				const name = typeof file.FileName === 'string' ? `${file.FileName}: ` : '';
				reasons.push(`${name}${typeof file.Message === 'string' ? file.Message : 'Upload failed'}`);
			}
		}
	}
	return reasons;
}

/** Renders a reply body as text for an error description (truncated). */
function describeBody(body: unknown): string {
	if (body === undefined || body === null || body === '') return 'Ivanti returned an empty body';
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	return `Ivanti replied: ${text.slice(0, 2000)}`;
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
 * @param headers  - Extra headers; each one replaces a default header of the same name
 * @returns Full HTTP response object including `headers` and `body`
 */
export async function ivantiApiRequestBinary(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	headers: IDataObject = {},
) {

	const credential = await this.getCredentials('ivantiNeuronsForItsmApiKeyApi');

	if (credential === undefined) {
		throw new NodeOperationError(this.getNode(), 'No credentials got returned!');
	}
	const url = buildBaseUrl(credential, endpoint);
	const options: IHttpRequestOptions = {
		method,
		body,
		url: url,
		json: false,
		// Return the body as a stream, so a large file is not held in memory and
		// is never auto-parsed (a numeric-looking body would become a number).
		// prepareBinaryData accepts the stream as is.
		encoding: 'stream',
		skipSslCertificateValidation: credential.skipSslVerification as boolean,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	applyHeaders(options, headers);

	const response = await sendRequest.call(this, options);
	if (isFailure(response)) {
		// The body is a stream here; an error reply is short JSON, so read it.
		throw ivantiApiError.call(this, response, parseJsonBody(await readErrorBody(response.body)));
	}
	return response;
}

/** Largest error reply read from a streamed body; the rest is discarded. */
const MAX_ERROR_BODY_BYTES = 64 * 1024;

/** Reads an error reply that may be a stream, a Buffer or already text. */
async function readErrorBody(body: unknown): Promise<unknown> {
	if (Buffer.isBuffer(body)) return body.toString('utf8');
	if (body === null || typeof body !== 'object' || !(Symbol.asyncIterator in body)) return body;

	const stream = body as AsyncIterable<Buffer | string> & { destroy?: () => void };
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of stream) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		chunks.push(buffer);
		size += buffer.length;
		if (size >= MAX_ERROR_BODY_BYTES) {
			stream.destroy?.();
			break;
		}
	}
	return Buffer.concat(chunks).subarray(0, MAX_ERROR_BODY_BYTES).toString('utf8');
}

/**
 * Adds caller-supplied headers to a request. Header names are matched without
 * regard to case, so an override such as `accept` replaces an existing `Accept`
 * rather than sending both.
 */
function applyHeaders(options: IHttpRequestOptions, headers: IDataObject): void {
	const entries = Object.entries(headers);
	if (entries.length === 0) return;
	const merged: IDataObject = { ...(options.headers ?? {}) };
	for (const [name, value] of entries) {
		for (const existing of Object.keys(merged)) {
			if (existing.toLowerCase() === name.toLowerCase()) delete merged[existing];
		}
		merged[name] = value;
	}
	options.headers = merged;
}

/**
 * Sends a request to the Ivanti API.
 *
 * Normally the credential's API key is added as the Authorization header. When
 * the caller has set its own Authorization header (through "Override Headers"),
 * that header is sent as-is and the credential's API key is not used. The
 * credential still supplies the tenant URL and the SSL setting.
 */
async function sendRequest(
	this: IExecuteFunctions | IExecuteSingleFunctions | IHookFunctions | ILoadOptionsFunctions | ITriggerFunctions | IPollFunctions,
	options: IHttpRequestOptions,
) {
	const hasOwnAuthorization = Object.keys(options.headers ?? {}).some(
		(name) => name.toLowerCase() === 'authorization',
	);
	if (hasOwnAuthorization) {
		return this.helpers.httpRequest(options);
	}
	return this.helpers.httpRequestWithAuthentication.call(this, 'ivantiNeuronsForItsmApiKeyApi', options);
}

/** Longest reply text shown in an error message. */
const MAX_ERROR_DETAIL_LENGTH = 500;

function buildIvantiErrorMessage(statusCode: number, body: unknown): string {
	let detail: string;

	if (typeof body === 'string') {
		detail = body.trim();
	} else if (body && typeof body === 'object') {
		const err = body as IvantiApiError;
		const msg = err.message ?? err.Message ?? err.error?.message ?? err.description ?? err.Description;
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

	// A proxy's HTML error page can be long; the description keeps more of it.
	if (detail.length > MAX_ERROR_DETAIL_LENGTH) {
		detail = `${detail.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`;
	}
	const prefix = errorPrefix(statusCode, body);
	return detail ? `${prefix}: ${detail}` : prefix;
}

/** `Ivanti API request failed (HTTP 400, ISM_4000)`, with Ivanti's code when the reply has one. */
function errorPrefix(statusCode: number, body: unknown): string {
	let code: unknown;
	if (body && typeof body === 'object' && !Array.isArray(body)) {
		const err = body as IvantiApiError;
		code = err.code ?? err.Code ?? err.error?.code;
	}
	return typeof code === 'string' && code.trim() !== ''
		? `Ivanti API request failed (HTTP ${statusCode}, ${code.trim()})`
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



/** Ivanti error replies, e.g. `{ "code": "ISM_4000", "description": "...", "message": ["..."] }`. Some endpoints use PascalCase. */
export interface IvantiApiError {
	code?: string;
	Code?: string;
	description?: string;
	Description?: string;
	message?: string | string[];
	Message?: string | string[];
	error?: { code?: string; message?: string };
}

