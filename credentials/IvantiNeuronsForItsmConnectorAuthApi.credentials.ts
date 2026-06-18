import type {
    Icon,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
    IAuthenticateGeneric,
} from 'n8n-workflow';
/**
 * Credential type used by the `IvantiNeuronsForItsmTrigger` node to make
 * authenticated outbound calls to the Ivanti Neurons for ITSM OData API
 * (e.g. fetching automation transaction records during webhook validation).
 *
 * Supports two authentication modes for the inbound webhook side:
 * - **Base** – HTTP Basic Auth (username + password)
 * - **Header** – a named header (Header Name) whose value must equal the
 *   Webhook API Key (e.g. an "x-api-key: <token>" pre-shared token)
 * 
 * Outbound API calls always use the API key via the `authenticate` block below.
 * The `tenant` field drives the base URL for both outbound requests and the
 * credential test; any accidental `https://` prefix or trailing slash is
 * stripped at runtime so users can paste the URL in either form.
 */
export class IvantiNeuronsForItsmConnectorAuthApi implements ICredentialType {
    name = 'ivantiNeuronsForItsmConnectorAuthApi';
    icon: Icon = { light: 'file:../icons/synergy.svg', dark: 'file:../icons/synergy.dark.svg' };
    documentationUrl = 'https://www.synergy.eu';
    displayName = 'Ivanti Neurons for ITSM Connector Auth API';
    genericAuth = true;
    properties: INodeProperties[] = [
        {
            displayName: 'Ensure the Ivanti Service Manager connector package is installed in the target system. Learn more <a href="https://www.synergy.eu" target="_blank">here</a>',
            name: 'moduleWarning',
            type: 'notice',
            default: '',
        },
        // Selects how the trigger node validates the inbound webhook caller's identity

        {
            displayName: 'Webhook Authentication Type',
            name: 'type',
            type: 'options',
            default: 'base',
            description: 'The authentication type to use. Base is HTTP Basic Auth, API Key is an API key, Header is an arbitrary raw header value.',
            options: [
                { name: 'Basic Auth', value: 'base' },
                { name: 'Api Key', value: 'apiKey' },
                { name: 'Header', value: 'header' },
            ],
        },
        // Shown only for Base auth mode
        {
            displayName: 'HTTP Basic Auth Username',
            name: 'username',
            type: 'string',
            description: 'The username for the HTTP Basic Auth. This is used for the Base auth mode.',
            displayOptions: {
                show: {
                    type: ['base'],
                },
            },
            default: '',
        },
        {
            displayName: 'HTTP Basic Auth Password',
            name: 'password',
            type: 'string',
            typeOptions: {
                password: true,
            },
            description: 'The password for the HTTP Basic Auth. This is used for the Base auth mode.',
            displayOptions: {
                show: {
                    type: ['base'],
                },
            },
            default: '',
        },
        {
            displayName: 'Header Name',
            name: 'header',
            type: 'string',
            placeholder: 'x-api-key',
            description: 'The name of the HTTP header the caller must send. Its value is matched against the Webhook API Key. Header names are case-insensitive.',
            displayOptions: {
                show: {
                    type: ['header'],
                },
            },
            default: '',
            required: true,
        },
        // Shown only for API Key auth mode or Header auth mode
        {
            displayName: 'Webhook API Key',
            name: 'webhookApiKey',
            type: 'string',
            default: '',
            required: true,
            typeOptions: {
                password: true,
            },
            displayOptions: {
                show: {
                    type: ['apiKey', 'header'],
                },
            },
            description: 'The API Key for the Webhook authentication.',
        },

        // Hostname (or host + path) of the Ivanti tenant, e.g. "acme.ivanticloud.com"
        {
            displayName: 'Ivanti Neurons for ITSM Tenant',
            name: 'tenant',
            type: 'string',
            default: '',
            required: true,
            description: 'The tenant hostname, e.g. sg-tenant.ivanti.com',
        },
        // REST API key used to authenticate outbound calls to the Ivanti OData API
        {
            displayName: 'Ivanti Neurons for ITSM API Key',
            name: 'apiKey',
            type: 'string',
            default: '',
            required: true,
            typeOptions: {
                password: true,
            },
            description: 'The API key for the Ivanti instance. This is used to authenticate with the Ivanti API.',
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
        // Useful for on-prem instances with self-signed certificates
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
    // Injects the API key as a query-style Authorization header for all outbound requests
    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                Authorization: '={{ "rest_api_key=" + $credentials.apiKey }}',
            },
        },
    };
    // Validates the credential by fetching a single Incidents page; strips any accidental
    // protocol prefix or trailing slash from the tenant value before building the URL
    test: ICredentialTestRequest = {
        request: {
            method: 'GET',
            baseURL: '={{ "https://" + $credentials.tenant.replace(/^https?:\\/\\//, "").replace(/\\/+$/, "") + ($credentials.isOnPrem ? "/HEAT" : "") + "/api/odata/businessobject" }}',
            url: '/N8N_AuthTypes',
        },
        rules: [
            {
                type: 'responseSuccessBody',
                properties: {
                    key: 'value[0].ReadOnly',
                    value: true,
                    message: 'Required module is not active.',
                },
            },
            {
                type: 'responseSuccessBody',
                properties: {
                    key: 'value[0].ReadOnly',
                    value: undefined,
                    message: 'Required module is not active.',
                },
            }
        ]
    };
}