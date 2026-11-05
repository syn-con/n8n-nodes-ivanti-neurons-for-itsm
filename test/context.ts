/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use Node built-ins */
import { Readable } from 'node:stream';
import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	IPollFunctions,
} from 'n8n-workflow';

/** One canned HTTP answer, as `httpRequest` returns it with `returnFullResponse`. */
export interface FakeResponse {
	statusCode: number;
	body?: unknown;
	headers?: IDataObject;
}

/** What the node handed to `prepareBinaryData`. */
export interface PreparedBinary {
	/** True when the body arrived as a stream rather than a Buffer held in memory. */
	streamed: boolean;
	content: Buffer;
	filePath?: string;
	mimeType?: string;
}

/** A request the node sent, with a copy of its query string (the pagers reuse theirs). */
export interface SentRequest extends IHttpRequestOptions {
	/** True when the credential's API key was used, false for an overridden Authorization header. */
	authenticated: boolean;
}

/** A parameter value, or a function of the item index for per-item values. */
type ParameterValue = unknown | ((itemIndex: number) => unknown);

export interface FakeContextOptions {
	parameters?: Record<string, ParameterValue>;
	/** Number of input items. */
	items?: number;
	/** The input items themselves, when their JSON or binary data matters. Overrides `items`. */
	inputItems?: INodeExecutionData[];
	typeVersion?: number;
	continueOnFail?: boolean;
	/** Answers to the requests, in order. A request beyond the last one fails the test. */
	responses?: FakeResponse[];
	isOnPrem?: boolean;
}

export interface FakeContext<T> {
	ctx: T;
	requests: SentRequest[];
	binaries: PreparedBinary[];
}

function buildContext(options: FakeContextOptions, readParameter: (name: string, args: unknown[]) => unknown) {
	const requests: SentRequest[] = [];
	const binaries: PreparedBinary[] = [];
	const responses = [...(options.responses ?? [])];
	const node = {
		id: 'test-node',
		name: 'Ivanti Neurons for ITSM',
		type: '@synergyconsulting/n8n-nodes-ivanti-neurons-for-itsm.ivantiNeuronsForItsm',
		typeVersion: options.typeVersion ?? 1.2,
		position: [0, 0],
		parameters: {},
	};

	const send = async (requestOptions: IHttpRequestOptions, authenticated: boolean) => {
		requests.push({ ...requestOptions, qs: { ...(requestOptions.qs ?? {}) }, authenticated });
		const next = responses.shift();
		if (next === undefined) {
			throw new Error(`Unexpected request ${requestOptions.method} ${requestOptions.url}: no fake response left`);
		}
		return next;
	};

	return {
		requests,
		binaries,
		ctx: {
			getNode: () => node,
			getNodeParameter: (name: string, ...args: unknown[]) => readParameter(name, args),
			getCredentials: async () => ({
				tenant: 'tenant.example.com',
				isOnPrem: options.isOnPrem ?? false,
				skipSslVerification: false,
			}),
			continueOnFail: () => options.continueOnFail ?? false,
			helpers: {
				httpRequest: async (requestOptions: IHttpRequestOptions) => send(requestOptions, false),
				httpRequestWithAuthentication: async (_credentialType: string, requestOptions: IHttpRequestOptions) =>
					send(requestOptions, true),
				prepareBinaryData: async (data: Buffer | Readable, filePath?: string, mimeType?: string) => {
					const chunks: Buffer[] = [];
					if (data instanceof Readable) {
						for await (const chunk of data) chunks.push(Buffer.from(chunk as Buffer));
					} else {
						chunks.push(data);
					}
					const content = Buffer.concat(chunks);
					binaries.push({ streamed: data instanceof Readable, content, filePath, mimeType });
					const binary: IBinaryData = {
						data: content.toString('base64'),
						mimeType: mimeType ?? 'application/octet-stream',
						fileName: filePath,
					};
					return binary;
				},
				returnJsonArray: (data: IDataObject | IDataObject[]) =>
					(Array.isArray(data) ? data : [data]).map((json) => ({ json })),
				constructExecutionMetaData: (
					items: INodeExecutionData[],
					{ itemData }: { itemData: { item: number } },
				) => items.map((item) => ({ ...item, pairedItem: itemData })),
			},
		},
	};
}

function lookup(options: FakeContextOptions, name: string, itemIndex: number, fallback: unknown, hasFallback: boolean) {
	const parameters = options.parameters ?? {};
	if (!(name in parameters)) {
		if (hasFallback) return fallback;
		throw new Error(`Could not get parameter "${name}"`);
	}
	const value = parameters[name];
	return typeof value === 'function' ? (value as (index: number) => unknown)(itemIndex) : value;
}

/**
 * A stand-in for the `this` of an action node's `execute`. Only the HTTP layer
 * is faked, so the node's own request, paging and error code runs as written.
 */
export function fakeExecuteContext(options: FakeContextOptions = {}): FakeContext<IExecuteFunctions> {
	const { ctx, requests, binaries } = buildContext(options, (name, [itemIndex, fallback]) =>
		lookup(options, name, itemIndex as number, fallback, fallback !== undefined),
	);
	const executeCtx = {
		...ctx,
		getInputData: () =>
			options.inputItems ?? Array.from({ length: options.items ?? 1 }, () => ({ json: {} })),
	};
	return { ctx: executeCtx as unknown as IExecuteFunctions, requests, binaries };
}

/** A stand-in for the `this` of a polling trigger: `getNodeParameter(name, fallback)`, no items. */
export function fakePollContext(options: FakeContextOptions = {}): FakeContext<IPollFunctions> {
	const { ctx, requests, binaries } = buildContext(options, (name, [fallback]) =>
		lookup(options, name, 0, fallback, fallback !== undefined),
	);
	return { ctx: ctx as unknown as IPollFunctions, requests, binaries };
}

/** An OData page answer of `count` records, numbered from `start`, as the JSON text Ivanti sends. */
export function page(count: number, start = 0): FakeResponse {
	const value = Array.from({ length: count }, (_, i) => ({ RecId: `rec-${start + i}` }));
	return { statusCode: 200, body: JSON.stringify({ value }) };
}
