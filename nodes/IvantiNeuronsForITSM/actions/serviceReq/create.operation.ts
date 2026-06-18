
import {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type IDataObject,
	NodeOperationError,
} from 'n8n-workflow';

import { updateDisplayOptions } from 'n8n-workflow';
import { ivantiApiRequest, ivantiApiRequestAllItems } from '../../transports';
import { serviceReqTemplateRLC } from '../../common';
const serviceReqParamsUrl = "/odata/businessobject/ServiceReqTemplateParams";

/**
 * UI property definitions for the **Service Request → Create** operation.
 *
 * Exposes:
 * - `serviceReqTemplateId` – Resource Locator for the template
 * - `employeeId` – GUID of the employee on whose behalf the request is created
 * - `subscriptionId` – GUID of the catalogue subscription
 * - `mode` – `manual` (resourceMapper) or `json` (raw JSON body)
 * - `parameters` – resourceMapper populated dynamically from the template schema
 * - `jsonParameters` – raw JSON input used in JSON mode
 * - `optionalParameters` – optional fields: `localOffset`, `employeeLocation`,
 *   `symptom`, `subject`
 */
export const properties: INodeProperties[] = [

	serviceReqTemplateRLC,
	{
		displayName: 'Employee RecId',
		name: 'employeeId',
		type: 'string',
		required: true,
		description: 'The ID of the employee to create the service request on. The Guid format is "07E1BD1BF5804E67B8E76B26FA6EF9A0".',
		default: '',
	},
	{
		displayName: 'Subscription ID',
		name: 'subscriptionId',
		type: 'string',
		required: true,
		description: 'The ID of the subscription to create the service request on. The Guid format is "07E1BD1BF5804E67B8E76B26FA6EF9A0".',
		default: '',
	},
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'manual',
		required: true,
		description: 'The mode of the create. Manual or JSON.',
		options: [
			{ name: 'Manual', value: 'manual' },
			{ name: 'JSON', value: 'json' },
		],
	},
	{
		displayName: 'Parameters',
		name: 'parameters',
		type: 'resourceMapper',
		default: {
			mappingMode: 'defineBelow',
			value: null,
		},
		required: true,
		typeOptions: {
			loadOptionsDependsOn: ['serviceReqTemplateId.value'],
			resourceMapper: {
				resourceMapperMethod: 'getServiceRequestParametersSchema',
				mode: 'add',
				valuesLabel: 'Parameter Values',
				supportAutoMap: false,
				fieldWords: {
					singular: 'parameter',
					plural: 'parameters',
				},
				addAllFields: true,
				multiKeyMatch: true,
			},
		},
		displayOptions: {
			show: {
				mode: ['manual'],
			},
		},
	},
	//JSON
	{
		displayName: 'JSON',
		name: 'jsonParameters',
		type: 'json',
		default: '',
		required: true,
		description: 'The JSON payload to create the service request with. Should be the parameters for the service request.',
		displayOptions: {
			show: {
				mode: ['json'],
			},
		},
	},
	{
		displayName: 'Optional Parameters',
		name: 'optionalParameters',
		placeholder: 'Add Optional Parameter',
		type: 'fixedCollection',
		default: [],
		typeOptions: {
			multipleValues: true,
		},
		options: [
			{
				name: 'localOffset',
				displayName: 'Local Offset',
				values: [
					{
						displayName: 'Value',
						name: 'value',
						type: 'number',
						default: 0,
					},
				],
			},
			{
				name: 'employeeLocation',
				displayName: 'Employee Location',
				values: [
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
				],
			},
			{
				name: 'symptom',
				displayName: 'Symptom',
				values: [
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
				],
			},
			{
				name: 'subject',
				displayName: 'Subject',
				values: [
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
				],
			},
		],
	}

]
const displayOptions = {
	show: {
		resource: ['serviceReq'],
		operation: ['create'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);


/**
 * Executes the **Service Request → Create** operation.
 *
 * Submits a new service request via `POST /rest/ServiceRequest/new`.
 * In `manual` mode, resourceMapper values are resolved and coerced to the
 * correct types (datetime normalisation, dropdown RecId mapping) by
 * `resolveParameters`. In `json` mode the raw JSON parameter is used directly.
 *
 * @throws {NodeOperationError} when the API responds with `IsSuccess === false`
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

	const returnData: INodeExecutionData[] = [];


	const items = this.getInputData();

	for (let i = 0; i < items.length; i++) {
		try {

			const serviceReqTemplateId = this.getNodeParameter('serviceReqTemplateId.value', i) as string;
			const employeeId = this.getNodeParameter('employeeId', i) as string;
			const subscriptionId = this.getNodeParameter('subscriptionId', i) as string;
			const mode = this.getNodeParameter('mode', i) as string;

			const optionalParameters = this.getNodeParameter(
				'optionalParameters',
				i,
				{},
			) as IDataObject;
			const body: IDataObject = {
				"attachmentsToDelete": [],
				"attachmentsToUpload": [],
				"delayedFulfill": false,
				"formName": "ServiceReq.ResponsiveAnalyst.DefaultLayout",
				"saveReqState": false,
				"serviceReqData": {
					"ProfileLink_RecID": employeeId,
					"ProfileLink_Category": "Employee",
					"Subject": (optionalParameters.subject as string) || '',
					"Symptom": (optionalParameters.symptom as string) || ''
				},
				"subscriptionId": subscriptionId,
				"strUserId": employeeId,
			};

			if (optionalParameters.employeeLocation) {
				body["strCustomerLocation"] = optionalParameters.employeeLocation;
			}
			if (optionalParameters.localOffset) {
				body["localOffset"] = optionalParameters.localOffset;
			}





		body["parameters"] = await resolveParameters.call(this, i, mode, serviceReqTemplateId);

		const response = await ivantiApiRequest.call(this, 'POST', '/rest/ServiceRequest/new', {}, body);
		if (!response) continue;
		if (response.IsSuccess === false) {
			throw new NodeOperationError(this.getNode(), response.Message as string);
		}
		const executionData = this.helpers.constructExecutionMetaData(
			this.helpers.returnJsonArray(response as IDataObject),
			{ itemData: { item: i } },
		);
		returnData.push(...executionData);
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: { error: (error as Error).message } });
				continue;
			}
			throw error;
		}
	}

	return returnData;
}

/**
 * Resolves the `parameters` node input into the flat key/value object expected
 * by the Ivanti service request API.
 *
 * In `json` mode returns the raw JSON parameter. In `manual` mode:
 * - Fetches the parameter type map for the template via `fetchParameterTypes`.
 * - Iterates resourceMapper values, skipping internal keys (`subscriptionId`, `strUserId`).
 * - Coerces each value with `coerceParameterValue` (datetime normalisation, etc.).
 * - Maps `_option`-suffixed keys (dropdown RecId fields) to `par-{recId}-recId` keys.
 * - Maps regular keys to `par-{recId}` keys.
 *
 * @param itemIndex          - Index of the currently processed input item
 * @param mode               - `'manual'` or `'json'`
 * @param serviceReqTemplateId - RecId of the selected template
 */
async function resolveParameters(
	this: IExecuteFunctions,
	itemIndex: number,
	mode: string,
	serviceReqTemplateId: string,
): Promise<IDataObject> {
	if (mode === 'json') {
		return this.getNodeParameter('jsonParameters', itemIndex, {}) as IDataObject;
	}

	const parametersValue = this.getNodeParameter('parameters.value', itemIndex, {}) as IDataObject;
	const parameterTypes = await fetchParameterTypes.call(this, serviceReqTemplateId);
	const parameters: IDataObject = {};

	for (const [key, rawValue] of Object.entries(parametersValue)) {
		if (key === 'subscriptionId' || key === 'strUserId') continue;
		if (rawValue === undefined || rawValue === null) continue;

		const recId = key.endsWith('_option') ? key.replace('_option', '') : key;
		const fieldType = parameterTypes[recId] ?? '';
		const value = coerceParameterValue(rawValue, fieldType);

		if (key.endsWith('_option')) {
			parameters[`par-${recId}-recId`] = value;
		} else {
			parameters[`par-${key}`] = value;
		}
	}

	return parameters;
}

/**
 * Fetches a `RecId → DisplayType` map for all parameters of the given template.
 * Used by `resolveParameters` to determine the correct type coercion for each value.
 *
 * @param serviceReqTemplateId - RecId of the Service Request Template
 * @returns Map of parameter RecId to lower-cased DisplayType string
 */
async function fetchParameterTypes(
	this: IExecuteFunctions,
	serviceReqTemplateId: string,
): Promise<Record<string, string>> {
	const schema = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
		$filter: `ParentLink_RecID eq '${serviceReqTemplateId}'`,
		$select: 'RecId,DisplayType',
	}, undefined) as IDataObject[];

	return Object.fromEntries(
		schema.map((item) => [item.RecId as string, (item.DisplayType as string).toLowerCase()]),
	);
}

/**
 * Coerces a raw parameter value to the string format expected by the Ivanti API.
 *
 * - Booleans and objects are stringified.
 * - `datetime` fields: milliseconds are stripped, timezone offsets are normalised to `Z`,
 *   and bare `T`-prefixed strings without a trailing `Z` have one appended.
 * - `date` fields: only the `YYYY-MM-DD` portion is kept and `T00:00:00Z` is appended.
 * - All other types are returned as-is.
 *
 * @param value     - Raw value from the resourceMapper
 * @param fieldType - Lower-cased Ivanti `DisplayType` string (e.g. `datetime`, `date`)
 * @returns Coerced string value ready for the API payload
 */
function coerceParameterValue(value: unknown, fieldType: string): string {
	let str: string;

	if (typeof value === 'boolean') {
		str = String(value);
	} else if (typeof value === 'object' && value !== null) {
		str = String(value);
	} else {
		str = value as string;
	}

	if (!str?.trim()) return str;

	if (fieldType.includes('datetime')) {
		str = str.replace(/\.\d{3}/, '');
		if (/[+-]\d{2}:\d{2}$/.test(str)) {
			str = str.replace(/[+-]\d{2}:\d{2}$/, 'Z');
		} else if (str.includes('T') && !str.endsWith('Z')) {
			str = str + 'Z';
		}
	} else if (fieldType.includes('date')) {
		const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (match) {
			str = `${match[1]}-${match[2]}-${match[3]}T00:00:00Z`;
		}
	}

	return str;
}
