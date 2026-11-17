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

/** `Incident#`, `frs_knowledge#`: letters, digits and underscores, ending with `#`. */
const BUSINESS_OBJECT_NAME = /^[A-Za-z0-9_]+#$/;

/**
 * UI property definitions for the **Business Object → Get Metadata** operation.
 *
 * Exposes:
 * - `metadataObject` – internal business object name ending with `#` (e.g. `Incident#`)
 */
export const properties: INodeProperties[] = [
    {
        displayName: 'Business Object',
        name: 'metadataObject',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'Incident#',
        description:
            'The internal (singular) name of the business object, ending with #, such as Incident# or Change#',
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
 * @throws {NodeOperationError} when the value is empty, does not end with `#`,
 *   or contains anything other than letters, digits and underscores before the `#`
 */
export function normalizeMetadataObject(this: IExecuteFunctions, value: unknown): string {
    const name = value === undefined || value === null ? '' : String(value).trim();
    if (name === '') {
        throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required');
    }
    if (!name.endsWith('#')) {
        throw new NodeOperationError(
            this.getNode(),
            `The "Business Object" must end with a "#" because the metadata API takes the internal name (e.g. "Incident#", "Change#")`,
        );
    }
    if (!BUSINESS_OBJECT_NAME.test(name)) {
        throw new NodeOperationError(this.getNode(), `Invalid business object name: "${name}"`, {
            description: 'Use the internal name of the business object, such as "Incident#": letters, digits and underscores, followed by one #',
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
