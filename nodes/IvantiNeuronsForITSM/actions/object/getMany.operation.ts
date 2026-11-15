import type {
    IDataObject,
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';



import { updateDisplayOptions, type DisplayCondition } from 'n8n-workflow';
import { odataListProperties } from '../../odata/queryProperties';
import { buildODataQuery } from '../../odata/queryBuilder';

import { fetchRecords, } from '../../transports'
import { continueOnFailItem, itemError } from '../itemErrors';
import { getOverrideHeaders } from '../requestOptions';
import { validateBusinessObject } from '../../common';

/**
 * UI property definitions for the **Business Object → Get Many** operation.
 *
 * Exposes:
 * - `object` – plural OData entity name
 * - `returnAll` / `limit` – pagination controls
 * - `selectAllFields` / `selectFields` – field projection (`$select`)
 * - `odataFilter` – multi-condition OData `$filter` builder
 * - `odataQuery` – JSON mode; from version 1.4 it also accepts `$search` (#73)
 * - `orderBy` / `orderDirection` – result ordering (`$orderby`)
 */
/** Version 1.3 only. */
const ONLY_V1_3: DisplayCondition[] = [{ _cnd: { between: { from: 1.3, to: 1.3 } } }];
/** Version 1.4 and later. */
const FROM_V1_4: DisplayCondition[] = [{ _cnd: { gte: 1.4 } }];

/**
 * The shared list properties, with Get Many's own description of the JSON
 * field from version 1.4, which accepts `$search` (#73). Other callers of
 * `odataListProperties` keep the version 1.3 description.
 */
const listProperties: INodeProperties[] = odataListProperties.flatMap((property) => {
    const show = property.displayOptions?.show;
    const fromV1_3 = property.name === 'odataQuery' && property.hint !== undefined;
    if (!fromV1_3) return [property];
    return [
        { ...property, displayOptions: { ...property.displayOptions, show: { ...show, '@version': ONLY_V1_3 } } },
        {
            ...property,
            description:
                'The OData options $search, $filter, $select and $orderby, with or without the $ sign. The values are sent to Ivanti as written. $select and $orderby may also be lists, e.g. ["LastModDateTime asc", "RecId asc"]. Paging ($top, $skip) is set by Return All and Limit.',
            hint: 'To fill in values from the input, switch the field to Expression and write e.g. "$search": "{{ $json.keyword }}", or pass a whole object with {{ $json.query }}',
            displayOptions: { ...property.displayOptions, show: { ...show, '@version': FROM_V1_4 } },
        },
    ];
});

export const properties: INodeProperties[] = [
    {
        displayName: "Business Object",
        name: "object",
        type: "string",
        default: "",
        required: true,
        noDataExpression: false,
        description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",

    },
    ...listProperties,
];

const displayOptions = {
    show: {
        resource: ['businessobject'],
        operation: ['getMany'],
    }
}


export const description = updateDisplayOptions(displayOptions, properties);

/**
 * Executes the **Business Object → Get Many** operation.
 *
 * Fetches records from `GET /odata/businessobject/{object}` with optional OData
 * `$filter`, `$select`, and `$orderby` parameters built from node inputs.
 *
 * - When `returnAll` is `true`, all pages are fetched via `ivantiApiRequestAllItems`.
 * - When `limit > 100`, pages are fetched via `ivantiApiRequestAllItemsWithLimit`.
 * - Otherwise a single request with `$top` is issued.
 *
 * @throws {NodeOperationError} when `object` is empty or does not end with `s`
 */
export async function execute(this: IExecuteFunctions): Promise<INodeExecutionData[]> {

    const items = this.getInputData();

    const returnData: INodeExecutionData[] = [];
    for (let i = 0; i < items.length; i++) {
        try {

            const object = this.getNodeParameter('object', i) as string;

            validateBusinessObject.call(this, object);

            const returnAll = this.getNodeParameter('returnAll', i) as boolean;

            const baseUrl = `/odata/businessobject/${object}`;

            const records: IDataObject[] = [];
            const odataQuery = buildODataQuery.call(this, i, { allowSearch: true }) as IDataObject;

            const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
            const allRecords = await fetchRecords.call(
                this,
                baseUrl,
                odataQuery,
                { returnAll, limit, headers: getOverrideHeaders.call(this, i) },
            );
            records.push(...allRecords);


            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(records),
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