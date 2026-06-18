import { FieldType, IDataObject, ILoadOptionsFunctions, INodeListSearchResult, ResourceMapperField } from 'n8n-workflow';

import { ivantiApiRequestAllItems } from '../transports';

const serviceReqTemplateUrl = "/odata/businessobject/ServiceReqTemplates";
const serviceReqTemplateFilter = "Status eq 'Published (Automatic)'";
const serviceReqTemplateSelect = "RecId,Name";
const serviceReqParamsUrl = "/odata/businessobject/ServiceReqTemplateParams";

const IGNORED_DISPLAY_TYPES = ['category', 'label', 'image', 'rowaligner'];
const DROPDOWN_DISPLAY_TYPES = ['dropdown', 'picklist', 'list', 'combo'];


/**
 * `listSearch` method – populates the Service Request Template Resource Locator dropdown.
 *
 * Fetches all published (`Status eq 'Published (Automatic)'`) Service Request Templates
 * and returns them sorted alphabetically by name.
 *
 * @returns List of `{ name, value, url }` entries where `value` is the template `RecId`.
 */
export async function getServiceReqTemplates(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
	const result: IDataObject[] = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqTemplateUrl, {
		"$filter": serviceReqTemplateFilter,
		"$select": serviceReqTemplateSelect,
	});

	return {
		results: result.map((item) => ({
			name: item.Name as string,
			value: item.RecId as string,
			url: '',
		})).sort((a, b) => a.name.localeCompare(b.name)),
	}
}


/**
 * `listSearch` method – populates the parameter list for the currently selected
 * Service Request Template.
 *
 * Reads `serviceReqTemplateId` from the current node parameter context and fetches
 * all `ServiceReqTemplateParams` records whose `ParentLink_RecID` matches.
 *
 * @returns List of `{ name, value }` entries where `value` is the parameter `RecId`.
 */
export async function getServiceReqTemplateParameters(this: ILoadOptionsFunctions) {
	const serviceReqTemplateId = this.getCurrentNodeParameter('serviceReqTemplateId') as string;
	const result: IDataObject[] = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
		"$filter": `ParentLink_RecID eq '${serviceReqTemplateId}'`,
		"$select": 'RecId,DisplayName,DisplayType,Name',
	});
	return {
		results: result.map((item) => ({
			name: item.Name as string,
			value: item.RecId as string,
			url: '',
		})),
	}
}

function capitalize(s: string): string {
	return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function extractBoName(configOptions: string): string | null {
	try {
		const config = JSON.parse(configOptions) as IDataObject;
		const additionalConfig = (config.configData as IDataObject)?.validationListAdditionalConfig
			?? config.validationListAdditionalConfig;
		const boName = (additionalConfig as IDataObject[])?.[0]?.boName as string | undefined;
		return boName ? boName.replace('#', '') : null;
	} catch {
		return null;
	}
}

interface DropdownTypeInfo {
	/** Resolved label, e.g. "Incident Dropdown", "Manual Dropdown", or "Dropdown". */
	displayType: string;
	/** The BO name prefix extracted from ConfigOptions, or null. */
	boName: string | null;
}

function resolveDropdownDisplayType(rawType: string, lowerType: string, configOptions: string | undefined): DropdownTypeInfo {
	let displayType = capitalize(rawType);
	if (displayType.toLowerCase() === 'combo') {
		displayType = 'Dropdown';
	}

	if (configOptions) {
		const boName = extractBoName(configOptions);
		if (boName) {
			return { displayType: `${boName} ${displayType}`, boName };
		}
	}

	if (lowerType.includes('list') || lowerType.includes('combo')) {
		return { displayType: `Manual ${displayType}`, boName: null };
	}

	return { displayType, boName: null };
}

function buildDropdownDisplayNames(
	name: string,
	displayType: string,
	boName: string | null,
): { valueDisplayName: string; recIdDisplayName: string } {
	if (boName) {
		const typeOnly = (displayType.split(' ')[1] ?? displayType).toLowerCase();
		return {
			valueDisplayName: `${name} (${typeOnly}) [${boName} Value]`,
			recIdDisplayName: `${name} (${typeOnly}) [${boName} RecId]`,
		};
	}
	const lowerDisplayType = displayType.toLowerCase();
	return {
		valueDisplayName: `${name} (${lowerDisplayType}) [Value]`,
		recIdDisplayName: `${name} (${lowerDisplayType}) [RecId]`,
	};
}

function mapFieldType(lowerType: string): FieldType {
	if (lowerType.includes('checkbox')) return 'boolean';
	if (lowerType.includes('datetime') || lowerType.includes('date')) return 'dateTime';
	if (lowerType.includes('time')) return 'time';
	return 'string';
}

/**
 * `resourceMapping` method – builds the dynamic field schema for the
 * "Create Service Request" resourceMapper UI component.
 *
 * For each `ServiceReqTemplateParam` belonging to the selected template:
 * - Layout/decoration parameters (`category`, `label`, `image`, `rowaligner`) are skipped.
 * - Dropdown/picklist/combo parameters produce **two** fields: one for the display value
 *   and one (`_option` suffix) for the associated RecId, allowing callers to supply either.
 * - `ConfigOptions` JSON is parsed to extract the backing business-object name for
 *   BO-linked dropdowns, which is surfaced in the field's `displayName`.
 * - `RequiredExpression === '$(true)'` marks a field as required.
 * - Field types are mapped to n8n resourceMapper types: `boolean`, `dateTime`, `time`,
 *   or `string` (default).
 *
 * Returns `{ fields: [] }` on any error so the UI degrades gracefully.
 *
 * @returns Object with a `fields` array conforming to n8n's resourceMapper field schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getServiceRequestParametersSchema(this: ILoadOptionsFunctions): Promise<{ fields: any[] }> {
	const serviceReqTemplateId = this.getCurrentNodeParameter('serviceReqTemplateId.value') as string;
	if (serviceReqTemplateId === '') {
		return { fields: [] };
	}
	try {
		const result: IDataObject[] = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
			"$filter": `ParentLink_RecID eq '${serviceReqTemplateId}'`,
			"$select": 'RecId,DisplayName,DisplayType,Name,ConfigOptions,RequiredExpression',
		});


		const fields: ResourceMapperField[] = [];

		for (const item of result) {
			const lowerType = (item.DisplayType as string).toLowerCase();

			if (IGNORED_DISPLAY_TYPES.some(t => lowerType.includes(t))) {
				continue;
			}

			const isDropdown = DROPDOWN_DISPLAY_TYPES.some(t => lowerType.includes(t));
			const isRequired = item.RequiredExpression === '$(true)';

			if (!isDropdown) {
				fields.push({
					id: item.RecId as string,
					displayName: `${item.Name} [${capitalize(item.DisplayType as string)}]`,
					required: isRequired,
					defaultMatch: false,
					display: true,
					type: mapFieldType(lowerType),
				});
				continue;
			}

			const { displayType, boName } = resolveDropdownDisplayType(
				item.DisplayType as string,
				lowerType,
				item.ConfigOptions as string | undefined,
			);
			const { valueDisplayName, recIdDisplayName } = buildDropdownDisplayNames(
				item.Name as string,
				displayType,
				boName,
			);

			fields.push(
				{
					id: item.RecId as string,
					displayName: valueDisplayName,
					required: isRequired,
					defaultMatch: false,
					display: true,
					type: 'string',
				},
				{
					id: `${item.RecId}_option`,
					displayName: recIdDisplayName,
					required: isRequired,
					defaultMatch: false,
					display: true,
					type: 'string',
				},
			);
		}

		fields.sort((a, b) => a.displayName.localeCompare(b.displayName));
		return { fields };

	} catch {
		return { fields: [] };
	}
}

/**
 * `resourceMapping` method – builds the simplified field schema for the
 * "Create Service Request (Simplified)" resourceMapper UI component.
 *
 * Behaviour mirrors `getServiceRequestParametersSchema`, with one key difference:
 * dropdown/picklist/combo parameters produce a **single** field (display value only)
 * rather than the value + RecId pair used by the full schema.
 *
 * - Layout/decoration parameters (`category`, `label`, `image`, `rowaligner`) are skipped.
 * - `ConfigOptions` JSON is parsed to extract the backing business-object name for
 *   BO-linked dropdowns, which is surfaced in the field's `displayName`.
 * - `RequiredExpression === '$(true)'` marks a field as required.
 * - Field types are mapped to n8n resourceMapper types: `boolean`, `dateTime`, `time`,
 *   or `string` (default).
 *
 * Returns `{ fields: [] }` on any error so the UI degrades gracefully.
 *
 * @returns Object with a `fields` array conforming to n8n's resourceMapper field schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getServiceRequestParametersSimplifiedSchema(this: ILoadOptionsFunctions): Promise<{ fields: any[] }> {
	const serviceReqTemplateId = this.getCurrentNodeParameter('serviceReqTemplateId.value') as string;
	if (serviceReqTemplateId === '') {
		return { fields: [] };
	}

	try {
		const result: IDataObject[] = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
			'$filter': `ParentLink_RecID eq '${serviceReqTemplateId}'`,
			'$select': 'RecId,DisplayName,DisplayType,Name,ConfigOptions,RequiredExpression',
		});


		const fields: ResourceMapperField[] = [];

		for (const item of result) {
			const lowerType = (item.DisplayType as string || '').toLowerCase();

			if (IGNORED_DISPLAY_TYPES.some(t => lowerType.includes(t))) {
				continue;
			}

			const isDropdown = DROPDOWN_DISPLAY_TYPES.some(t => lowerType.includes(t));
			const isRequired = item.RequiredExpression === '$(true)';

			// Resolve the human-readable display type label (e.g. "Incident Dropdown", "Manual Dropdown").
			const displayType = isDropdown
				? resolveDropdownDisplayType(item.DisplayType as string, lowerType, item.ConfigOptions as string | undefined).displayType
				: capitalize(item.DisplayType as string);

			fields.push({
				id: item.RecId as string,
				displayName: `${item.Name} [${displayType}]`,
				required: isRequired,
				defaultMatch: false,
				display: true,
				type: mapFieldType(lowerType),
			});
		}

		fields.sort((a, b) => a.displayName.localeCompare(b.displayName));
		return { fields };

	} catch {
		return { fields: [] };
	}
}

