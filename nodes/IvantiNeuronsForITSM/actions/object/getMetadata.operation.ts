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

/**
 * UI property definitions for the **Business Object → Get Metadata** operation.
 *
 * Exposes:
 * - `metadataObject` – internal business object name (e.g. `Incident#`), optionally
 *   followed by a child object (e.g. `frs_knowledge#Document`)
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
            'The internal (singular) name of the business object, such as Incident# or Change#. The # may be left out. To read a child object, add its name after the #, such as frs_knowledge#Document',
    },
];

const displayOptions = {
    show: {
        resource: ['businessobject'],
        operation: ['getMetadata'],
    },
};

export const description = updateDisplayOptions(displayOptions, properties);

/** `Incident`, `Incident#`, `frs_knowledge#Document`: letters, digits and underscores, with one optional `#`. */
const BUSINESS_OBJECT_NAME = /^[A-Za-z0-9_]+(#[A-Za-z0-9_]*)?$/;

/**
 * Turns the parameter value into the name Ivanti expects: trimmed, and with a
 * trailing `#` added when the value has none (`Incident` becomes `Incident#`).
 *
 * @throws {NodeOperationError} when the value is empty or contains anything
 *   other than letters, digits, underscores and one `#`
 */
export function normalizeMetadataObject(this: IExecuteFunctions, value: unknown): string {
    const name = value === undefined || value === null ? '' : String(value).trim();
    if (name === '') {
        throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required');
    }
    if (!BUSINESS_OBJECT_NAME.test(name)) {
        throw new NodeOperationError(this.getNode(), `Invalid business object name: "${name}"`, {
            description:
                'Use the internal name of the business object, such as "Incident#", or "frs_knowledge#Document" for a child object. It may contain letters, digits, underscores and one #',
        });
    }
    return name.includes('#') ? name : `${name}#`;
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
