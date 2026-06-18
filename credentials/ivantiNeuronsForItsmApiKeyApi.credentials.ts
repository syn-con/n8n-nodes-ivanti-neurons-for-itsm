import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ivantiNeuronsForItsmApiKeyApi implements ICredentialType {
	name = 'ivantiNeuronsForItsmApiKeyApi';
	icon: Icon = { light: 'file:../icons/ivant-neurons-for-itsm.svg', dark: 'file:../icons/ivant-neurons-for-itsm.dark.svg' };
	displayName = 'Ivanti Neurons for ITSM API';
	documentationUrl = 'https://help.ivanti.com/ht/help/en_US/ISM/2022/admin/Content/Configure/API/RestAPI-Introduction.htm';
	properties: INodeProperties[] = [
		{
			displayName: 'Ivanti Neurons for ITSM Tenant',
			name: 'tenant',
			type: 'string',
			default: '',
			placeholder: 'sg-tenant.ivanti.com',
			required: true,
			description: 'The tenant hostname, e.g. sg-tenant.ivanti.com',
		},
		{
			displayName: 'Ivanti Neurons for ITSM API Key',
			name: 'apiKey',
			type: 'string',
			default: '',
			description: 'The API key for the Ivanti instance. This is used to authenticate with the Ivanti API.',
			required: true,
			typeOptions: {
				password: true,
			},
		},
		{
			displayName: 'Is On Prem',
			name: 'isOnPrem',
			type: 'boolean',
			default: false,
			description: 'Whether the Ivanti instance is on-premises or cloud-based. If on-premises, the API base path will be /HEAT/api',
		},
		{
			displayName:
				'Security warning: enabling "Skip SSL Verification" disables TLS validation and can expose your API key to man-in-the-middle attackers. Prefer installing the Ivanti CA certificate on the n8n host.',
			name: 'skipSslVerificationWarning',
			type: 'notice',
			default: '',
			displayOptions: { show: { skipSslVerification: [true] } },
		},
		{
			displayName: 'Skip SSL Verification',
			name: 'skipSslVerification',
			type: 'boolean',
			default: false,
			description:
				'Whether to disable TLS certificate validation for ALL requests made with this credential. ' +
				'Leave this off. When enabled, an on-path (man-in-the-middle) attacker can intercept the ' +
				'connection and steal your API key, because the key is sent on every request. ' +
				'For self-signed certificates, install the issuing CA on the n8n host instead of enabling this.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{ "rest_api_key=" + $credentials.apiKey }}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{ "https://" + $credentials.tenant.replace(/^https?:\\/\\//, "").replace(/\\/+$/, "") + ($credentials.isOnPrem ? "/HEAT" : "") + "/api/odata/businessobject" }}',
			method: 'GET',
			url: '/Incidents?$top=1',
		},
	};
}
