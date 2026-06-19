import {
    type IExecuteFunctions,
    type INodeExecutionData,
    type INodeType,
    type INodeTypeDescription,
} from 'n8n-workflow';

import { router } from './actions/router';

import * as search from './actions/search';
import * as object from './actions/object';
import * as attachment from './actions/attachment';
import * as relationship from './actions/relationship';

import * as serviceReq from './actions/serviceReq';
import * as quickAction from './actions/quickAction';
import * as automation from './actions/automation';

import { getServiceReqTemplates, getServiceReqTemplateParameters, getServiceRequestParametersSchema, getServiceRequestParametersSimplifiedSchema } from './methods/listSearch';

/**
 * Main action node for Ivanti Neurons for ITSM.
 *
 * Exposes all CRUD and search operations across the following resources:
 * - **Business Object** – create, read, update, delete, and keyword-search OData entities
 * - **Attachment** – upload, read, and delete file attachments
 * - **Relationship** – link, unlink, and traverse object relationships
 * - **Automation** – report transaction status back to an Ivanti automation job
 * - **Service Request** – create service requests, list subscriptions, and inspect parameters
 * - **Search** – full-text search (single object or global) and saved-search execution
 * - **Quick Action** – trigger a named quick action on a business-object record
 *
 * All resources authenticate with the API-key credential (`ivantiNeuronsForItsmApiKeyApi`).
 *
 * The node delegates execution to the {@link router} function, which dispatches to the
 * appropriate operation module based on the `resource` and `operation` parameters.
 */
export class IvantiNeuronsForItsm implements INodeType {

    description: INodeTypeDescription = {
        displayName: 'Ivanti Neurons for ITSM',
        name: 'ivantiNeuronsForItsm',
        group: ['transform'],
        icon: { light: 'file:../../icons/ivant-neurons-for-itsm.svg', dark: 'file:../../icons/ivant-neurons-for-itsm.dark.svg' },
        version: 1,
        subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
        description: 'Interact with Ivanti Neurons for ITSM API',
        defaults: {
            name: 'Ivanti Neurons for ITSM',
        },
        inputs: ['main'],
        outputs: ['main'],
        // Exposed as an AI-agent tool for all JSON-based resources (Business Object,
        // Relationship, Search, Service Request, Quick Action). NOTE: the Attachment
        // resource's "Upload" and "Read" operations move binary data, which cannot
        // cross the tool interface (see .agents/nodes.md). Those two operations are
        // only fully functional in normal (non-tool) workflow execution.
        usableAsTool: true,
        credentials: [
            {
                name: 'ivantiNeuronsForItsmApiKeyApi',
                required: true,
            }
        ],
        properties: [
            {
                displayName: 'Resource',
                name: 'resource',
                type: 'options',
                noDataExpression: true,
                options: [
                    {
                        name: 'Attachment',
                        value: 'attachment',
                    },
                    {
                        name: 'Automation',
                        value: 'automation',
                    },
                    {
                        name: 'Business Object',
                        value: 'businessobject',
                    },
                    {
                        name: 'Quick Action',
                        value: 'quickAction',
                    },
                    {
                        name: 'Relationship',
                        value: 'relationship',
                    },
                    {
                        name: 'Search',
                        value: 'search',
                    },
                    {
                        name: 'Service Request',
                        value: 'serviceReq',
                    },
                ],
                default: 'businessobject',
            },
            ...object.description,
            ...search.description,
            ...attachment.description,
            ...relationship.description,
            ...serviceReq.description,
            ...quickAction.description,
            ...automation.description,
        ]
    }

    methods = {
        listSearch: {
            /** Fetches published Service Request Templates for the template Resource Locator. */
            getServiceReqTemplates,
            /** Fetches parameters belonging to the currently selected Service Request Template. */
            getServiceReqTemplateParameters,
        },
        resourceMapping: {
            /** Builds the dynamic field schema used by the resourceMapper in the Create Service Request operation. */
            getServiceRequestParametersSchema,

            /** Builds the simplified field schema used by the resourceMapper in the Create Service Request operation. */
            getServiceRequestParametersSimplifiedSchema,
        },
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        return router.call(this);
    }
}
