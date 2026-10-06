import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/** HTTP header name characters allowed by RFC 9110 (`token`). */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Shared "Options" collection added to every operation except the Automation
 * resource. Holds settings that apply to the HTTP requests an operation sends,
 * rather than to the Ivanti record it works on.
 */
export const requestOptionsDescription: INodeProperties[] = [
	{
		displayName: 'Options',
		name: 'requestOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			hide: {
				resource: ['automation'],
			},
		},
		options: [
			{
				displayName: 'Override Headers',
				name: 'overrideHeaders',
				type: 'fixedCollection',
				placeholder: 'Add Header',
				default: {},
				typeOptions: { multipleValues: true },
				description:
					'HTTP headers to send with every request this operation makes. A header set here replaces the default header of the same name. If you set an Authorization header, it is sent instead of the API key from the credential.',
				options: [
					{
						name: 'header',
						displayName: 'Header',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								placeholder: 'Accept-Language',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								placeholder: 'en-US',
							},
						],
					},
				],
			},
		],
	},
];

/**
 * Reads the "Override Headers" option for one input item and returns it as a
 * header object ready to merge into a request.
 *
 * Rows with an empty name are skipped. A name that is not a valid HTTP header
 * token is rejected, so a typo fails clearly instead of being sent as a broken
 * request.
 *
 * @throws {NodeOperationError} when a header name contains invalid characters
 */
export function getOverrideHeaders(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const rows = this.getNodeParameter(
		'requestOptions.overrideHeaders.header',
		itemIndex,
		[],
	) as Array<{ name?: string; value?: unknown }>;

	const headers: IDataObject = {};
	for (const row of rows) {
		const name = (row.name ?? '').trim();
		if (name === '') continue;
		if (!HEADER_NAME_PATTERN.test(name)) {
			throw new NodeOperationError(this.getNode(), `Invalid header name: "${name}"`, {
				itemIndex,
				description: 'Header names may only contain letters, digits and the characters !#$%&\'*+-.^_`|~',
			});
		}
		headers[name] = row.value === undefined || row.value === null ? '' : String(row.value);
	}
	return headers;
}
