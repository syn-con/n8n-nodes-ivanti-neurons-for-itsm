
import {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type IDataObject,
	NodeOperationError,
} from 'n8n-workflow';

import { updateDisplayOptions } from 'n8n-workflow';
import { ivantiApiRequest } from '../../transports';
import { serviceReqTemplateRLC, SearchResponse, escapeODataString} from '../../common';
const serviceReqParamsUrl = "/rest/ServiceRequest/";
const subscriptionUrl = "/rest/Template";
const employeeUrl = "/odata/businessobject/Employees";
export const properties: INodeProperties[] = [

	serviceReqTemplateRLC,

	{
		displayName: 'Employee Login ID',
		name: 'loginId',
		type: 'string',
		required: true,
		description: 'The Login ID of the employee to create the service request for. If you are using the "JSON" mode, you can use the "Employee Login ID" as the key in the JSON payload.',
		default: '',
	},
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'manual',
		required: true,
		description: 'The mode of the creation of the service request. If you are using the "JSON" mode, you can use the "Employee Login ID" as the key in the JSON payload.',
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
				resourceMapperMethod: 'getServiceRequestParametersSimplifiedSchema',
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
		default: {},
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
		default: {},
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
		operation: ['createSimplified'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Looks up an employee by Login ID and returns their `RecId`.
 * Results are memoised in `cache` (loginId → RecId) for the lifetime of the execution.
 *
 * @throws {NodeOperationError} when no employee matches the given Login ID.
 */
async function resolveEmployeeRecId(
	this: IExecuteFunctions,
	loginId: string,
	cache: Map<string, string>,
): Promise<string> {
	const cached = cache.get(loginId);
	if (cached !== undefined) return cached;

	const response = await ivantiApiRequest.call(this, 'GET', employeeUrl, {
		$filter: `LoginID eq ${escapeODataString(loginId)}`,
	}, {}) as SearchResponse;

	const employee = response?.value?.[0];
	if (!employee) {
		throw new NodeOperationError(this.getNode(), `No employee found with Login ID '${loginId}'`);
	}
	const recId = employee.RecId as string;
	cache.set(loginId, recId);
	return recId;
}

/**
 * Fetches the employee's template subscriptions and returns the `strSubscriptionId`
 * for the requested template.
 *
 * The full subscriptions list is cached by `loginId` so that multiple items sharing
 * the same employee only trigger one API call. Each employee can hold many subscriptions,
 * so the cached value is the complete array rather than a single entry.
 *
 * @throws {NodeOperationError} when the employee has no subscriptions, or the
 *   selected template is not among them.
 */
async function resolveSubscriptionId(
	this: IExecuteFunctions,
	loginId: string,
	employeeRecId: string,
	serviceReqTemplateId: string,
	cache: Map<string, IDataObject[]>,
): Promise<string> {
	let subscriptions = cache.get(loginId);

	if (subscriptions === undefined) {
		subscriptions = await ivantiApiRequest.call(
			this, 'GET', `${subscriptionUrl}/${employeeRecId}/_All_`, {}, {},
		) as IDataObject[];
		cache.set(loginId, subscriptions ?? []);
	}

	if (!subscriptions?.length) {
		throw new NodeOperationError(this.getNode(), 'No subscriptions found for this employee');
	}

	const subscription = subscriptions.find(s => s.strRecId === serviceReqTemplateId);
	if (!subscription) {
		throw new NodeOperationError(this.getNode(), 'The selected service request template is not available to this employee');
	}
	return subscription.strSubscriptionId as string;
}

/**
 * Constructs the base request body for `POST /rest/ServiceRequest/new`.
 * Optional fields (`strCustomerLocation`, `localOffset`) are appended only when provided.
 */
function buildRequestBody(
	employeeRecId: string,
	subscriptionId: string,
	optionalParameters: IDataObject,
): IDataObject {
	const body: IDataObject = {
		attachmentsToDelete: [],
		attachmentsToUpload: [],
		delayedFulfill: false,
		formName: 'ServiceReq.ResponsiveAnalyst.DefaultLayout',
		saveReqState: false,
		serviceReqData: {
			ProfileLink_RecID: employeeRecId,
			ProfileLink_Category: 'Employee',
			Subject: (optionalParameters.subject as string) || '',
			Symptom: (optionalParameters.symptom as string) || '',
		},
		subscriptionId,
		strUserId: employeeRecId,
	};

	if (optionalParameters.employeeLocation) {
		body.strCustomerLocation = optionalParameters.employeeLocation;
	}
	if (optionalParameters.localOffset) {
		body.localOffset = optionalParameters.localOffset;
	}

	return body;
}

/**
 * Resolves the `parameters` node input into the flat key/value object expected
 * by the Ivanti service request API.
 *
 * In `json` mode, returns the raw JSON parameter directly.
 * In `manual` mode:
 * - Validates required fields against the resourceMapper schema.
 * - For dropdown/picklist/list/combo fields (identified by the display name suffix),
 *   fetches the `ValidationList` and resolves the text value to its RecId, producing
 *   both a `par-{id}` (display value) and a `par-{id}-recId` (RecId) entry.
 * - Maps all other fields to `par-{id}`.
 *
 * `validationListCache` is keyed by `templateRecId` and maps each parameter ID to its
 * `ValidationList` response, eliminating repeated API calls when multiple items share
 * the same template.
 *
 * @param itemIndex         - Index of the currently processed input item
 * @param mode              - `'manual'` or `'json'`
 * @param templateRecId     - RecId of the service request template (cache namespace)
 * @param validationListCache - Two-level cache: templateRecId → parameterId → ValidationList
 */
async function resolveParameters(
	this: IExecuteFunctions,
	itemIndex: number,
	mode: string,
	templateRecId: string,
	validationListCache: Map<string, Map<string, IDataObject[][]>>,
): Promise<IDataObject> {
	if (mode === 'json') {
		return this.getNodeParameter('jsonParameters', itemIndex, {}) as IDataObject;
	}

	const parameters = this.getNodeParameter('parameters', itemIndex, {}) as IDataObject;
	const parametersValue = parameters.value as IDataObject;
	const schema = parameters.schema as IDataObject[];

	if (!validationListCache.has(templateRecId)) {
		validationListCache.set(templateRecId, new Map());
	}
	const templateValidationCache = validationListCache.get(templateRecId)!;

	const result: IDataObject = {};

	for (const field of schema) {
		const id = field.id as string;
		const value = parametersValue[id];

		if (field.required === true && (value === undefined || value === null)) {
			throw new NodeOperationError(this.getNode(), `The parameter '${field.displayName}' is required`);
		}

		const displayName = field.displayName as string;
		const isDropdown = ['Dropdown', 'Picklist', 'List', 'Combo'].some(t => displayName.includes(t));

		if (isDropdown) {
			let validationList = templateValidationCache.get(id);
			if (validationList === undefined) {
				validationList = await ivantiApiRequest.call(
					this, 'GET', `${serviceReqParamsUrl}${id}/ValidationList`, {}, {},
				) as IDataObject[][];
				templateValidationCache.set(id, validationList ?? []);
			}
			if (!validationList?.length) continue;

			// ValidationList rows: [RecId, displayValue, altValue?]
			const match = validationList.find(row => row[1] === value || row[2] === value);
			if (!match) {
				throw new NodeOperationError(this.getNode(), `The value '${value}' is not valid for parameter '${field.displayName}'`);
			}
			result[`par-${id}`] = value as string;
			result[`par-${id}-recId`] = match[0] as unknown as string;
		} else {
			result[`par-${id}`] = value;
		}
	}

	return result;
}

/**
 * Executes the **Service Request → Create (Simplified)** operation.
 *
 * Unlike the full Create operation, this variant accepts only a Login ID and
 * automatically resolves the employee's RecId and subscription ID before
 * submitting the request to `POST /rest/ServiceRequest/new`.
 *
 * In `manual` mode, resourceMapper values are validated and dropdown fields are
 * resolved to their RecId pairs via `resolveParameters`. In `json` mode the
 * raw JSON parameter is forwarded directly.
 *
 * @throws {NodeOperationError} when the employee is not found, the template is
 *   not available to them, a required parameter is missing, or the API reports failure.
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];
	const items = this.getInputData();

	// loginId → employeeRecId
	const employeeRecIdCache = new Map<string, string>();
	// loginId → all subscriptions for that employee
	const subscriptionCache = new Map<string, IDataObject[]>();
	// templateRecId → (parameterId → ValidationList rows)
	const validationListCache = new Map<string, Map<string, IDataObject[][]>>();

	for (let i = 0; i < items.length; i++) {
		try {
			const serviceReqTemplateId = this.getNodeParameter('serviceReqTemplateId.value', i) as string;
			const loginId = this.getNodeParameter('loginId', i) as string;
			const mode = this.getNodeParameter('mode', i) as string;
			const optionalParameters = this.getNodeParameter('optionalParameters', i, {}) as IDataObject;

			const employeeRecId = await resolveEmployeeRecId.call(this, loginId, employeeRecIdCache);
			const subscriptionId = await resolveSubscriptionId.call(this, loginId, employeeRecId, serviceReqTemplateId, subscriptionCache);

			const body = buildRequestBody(employeeRecId, subscriptionId, optionalParameters);
			body.parameters = await resolveParameters.call(this, i, mode, serviceReqTemplateId, validationListCache);

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
