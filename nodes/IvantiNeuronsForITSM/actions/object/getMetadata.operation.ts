import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
    IDataObject,
} from 'n8n-workflow';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports';
import { continueOnFailItem, itemError } from '../itemErrors';
import { getOverrideHeaders } from '../requestOptions';

/** `Incident#`, or `CI#Computer` for a subtype: letters, digits and underscores, one `#`, then an optional subtype name. */
const BUSINESS_OBJECT_NAME = /^[A-Za-z0-9_]+#[A-Za-z0-9_]*$/;

/**
 * UI property definitions for the **Business Object → Get Metadata** operation.
 *
 * Exposes:
 * - `metadataObject` – internal business object name with a `#` (e.g. `Incident#`, or `CI#Computer` for a subtype)
 */
export const properties: INodeProperties[] = [
    {
        displayName:
            'On Ivanti Service Manager on-premises 2026.2.0.20260827, the API does not return metadata for subtype (extension) objects such as CI#Computer. Use the base object, e.g. CI#.',
        name: 'subtypeNotice',
        type: 'notice',
        default: '',
    },
    {
        displayName: 'Business Object',
        name: 'metadataObject',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'Incident#',
        description:
            'The internal (singular) name of the business object followed by #, such as Incident# or Change#. For a subtype, add its name after the #, such as CI#Computer.',
    },
];

const displayOptions = {
    show: {
        resource: ['businessobject'],
        operation: ['getMetadata'],
    },
};

export const description = updateDisplayOptions(displayOptions, properties);


/**
 * Checks the parameter value and returns it trimmed.
 *
 * @throws {NodeOperationError} when the value is empty, has no `#`, or contains
 *   anything other than letters, digits, underscores and one `#`
 */
export function normalizeMetadataObject(this: IExecuteFunctions, value: unknown): string {
    const name = value === undefined || value === null ? '' : String(value).trim();
    if (name === '') {
        throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required');
    }
    if (!name.includes('#')) {
        throw new NodeOperationError(
            this.getNode(),
            `The "Business Object" must contain a "#" because the metadata API takes the internal name (e.g. "Incident#", or "CI#Computer" for a subtype)`,
        );
    }
    if (!BUSINESS_OBJECT_NAME.test(name)) {
        throw new NodeOperationError(this.getNode(), `Invalid business object name: "${name}"`, {
            description: 'Use the internal name of the business object, such as "Incident#" or "CI#Computer": letters, digits and underscores, one #, then an optional subtype name',
        });
    }
    return name;
}

/**
 * Executes the **Business Object → Get Metadata** operation.
 *
 * Issues `GET /rest/GetBusinessObjectMetadata` with the body
 * `{ "BusinessObject": "<name>" }` for each input item, as described in
 * https://docs.ivanti.com/neurons-for-itsm/admin-user-help/enu/latest/getbusinessobjectmetadata,
 * and returns Ivanti's reply (the fields, linked objects, saved searches,
 * templates and quick actions of the business object) as one item.
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
        try {
            const businessObject = normalizeMetadataObject.call(this, this.getNodeParameter('metadataObject', i));

            const response = await ivantiApiRequest.call(
                this,
                'GET',
                '/rest/GetBusinessObjectMetadata',
                {},
                { BusinessObject: businessObject },
                getOverrideHeaders.call(this, i),
            );

            // An empty reply carries no metadata; return an empty item rather than failing.
            const responseData: IDataObject =
                response && typeof response === 'object' ? (response as IDataObject) : {};

            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(responseData),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);
        } catch (error) {
            if (this.continueOnFail()) {
                returnData.push(continueOnFailItem(error, i));
            } else {
                throw itemError.call(this, error, i);
            }
        }
    }

    return returnData;
}
