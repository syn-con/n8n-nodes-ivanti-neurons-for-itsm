import {
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription
} from 'n8n-workflow';

import { router } from './actions/router';
import * as automation from './actions/automation';

/**
 * Connector action node for Ivanti Neurons Workflow Automation.
 *
 * Exposes a single resource:
 * - **Automation** – report the outcome of an Ivanti automation transaction back to the
 *   platform (the `Update Automation Transaction` operation), setting its `Status`,
 *   `JobResult`, and a `ReturnPayload` containing the n8n execution URL for traceability.
 *
 * The node delegates execution to the {@link router} function, which dispatches to the
 * `automation` operation module based on the `resource` and `operation` parameters.
 */
export class IvantiNeuronsForItsmConnector implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ivanti Neurons for ITSM Connector',
		name: 'ivantiNeuronsForItsmConnector',
		group: ['transform'],
		icon: { light: 'file:../../icons/synergy.svg', dark: 'file:../../icons/synergy.dark.svg' },
		version: 1,
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description: "Interact with Ivanti Neurons Workflow Automation Block.",
		defaults: {
			name: 'Ivanti Neurons for ITSM Connector',
		},
		inputs: ["main"],
		outputs: ["main"],
		usableAsTool: true,
		credentials: [
			{
				name: 'ivantiNeuronsForItsmConnectorAuthApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Automation',
						value: 'automation',
					},
				],
				default: 'automation',
			},
			...automation.description,
		],
	};
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return router.call(this);
	}
}
