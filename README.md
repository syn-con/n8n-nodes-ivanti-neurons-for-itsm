# n8n-nodes-ivanti-neurons-for-itsm

[![NPM Version](https://img.shields.io/npm/v/n8n-nodes-ivanti-neurons-for-itsm?style=flat-square)](https://www.npmjs.com/package/@synergyconsulting/n8n-nodes-ivanti-neurons-for-itsm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

A comprehensive n8n community node package for automating [Ivanti Neurons for ITSM](https://www.ivanti.com/products/ivanti-neurons-itsm) from your [n8n](https://n8n.io/) workflows.

Ivanti Neurons for ITSM is an enterprise IT service management platform for managing incidents, changes, service requests, problems, and other ITSM processes. This package provides deep integration with the Ivanti REST/OData API, enabling sophisticated automation workflows for IT operations.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Nodes Overview](#nodes-overview)
- [Credentials Setup](#credentials-setup)
- [Resources & Operations](#resources--operations)
- [Usage Examples](#usage-examples)
- [Advanced Topics](#advanced-topics)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [API Reference](#api-reference)
- [FAQ](#faq)
- [Support & Contributing](#support--contributing)
- [License](#license)

---

## Features

- **Full OData Support**: Complete CRUD operations on any Ivanti business object
- **Smart Polling**: Intelligent trigger node with deduplication and filtering
- **Webhook Integration**: Seamless integration with Ivanti automation runbooks
- **Attachment Management**: Upload, download, and delete file attachments
- **Relationship Traversal**: Navigate complex object relationships
- **Service Catalog**: Create and manage service requests programmatically
- **Advanced Search**: Full-text search, keyword search, and saved searches
- **Quick Actions**: Trigger Ivanti quick actions from workflows
- **On-Premises Support**: Works with both cloud and on-premises instances
- **Comprehensive Error Handling**: Detailed error messages and validation

---

## Installation

### Option 1: Community Node Installation (Recommended)

1. In n8n, navigate to **Settings** → **Community Nodes**
2. Click **Install a community node**
3. Enter `n8n-nodes-ivanti-neurons-for-itsm` in the search field
4. Click **Install**

### Option 2: Manual Installation

For self-hosted n8n instances:

```bash
# Navigate to your n8n installation directory
cd ~/.n8n

# Install the package
npm install n8n-nodes-ivanti-neurons-for-itsm

# Restart n8n
n8n start
```

### Option 3: Docker Installation

Add to your Docker Compose file:

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    environment:
      - N8N_COMMUNITY_PACKAGES=n8n-nodes-ivanti-neurons-for-itsm
    # ... other configuration
```

---

## Quick Start

### 1. Set Up Credentials

Before using any nodes, configure your Ivanti credentials:

1. In n8n, go to **Credentials** → **New**
2. Search for "Ivanti Neurons for ITSM API"
3. Fill in:
   - **Tenant**: Your Ivanti hostname (e.g., `mytenant.ivanticloud.com`)
   - **API Key**: Your Ivanti REST API key
   - **Is On Prem**: Check if using on-premises instance
4. Click **Test & Save**

### 2. Create Your First Workflow

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  Slack Trigger  │────▶│  Ivanti Neurons      │────▶│  Slack Reply │
│  /incident cmd  │     │  Create Incident     │     │  with IncNum  │
└─────────────────┘     └──────────────────────┘     └──────────────┘
```

This workflow allows users to create Ivanti incidents directly from Slack using a slash command, bridging your collaboration tool with your ITSM platform.

---

## Nodes Overview

This package includes **four nodes** for comprehensive Ivanti integration:

### 1. Ivanti Neurons for ITSM (Action Node)

**Purpose**: Perform CRUD operations and interact with the Ivanti API

**Icon**: Ivanti Neurons logo

**Use Cases**:
- Query and update incidents, changes, problems
- Create service requests
- Upload and manage attachments
- Execute searches and quick actions
- Manage object relationships

### 2. Ivanti Neurons for ITSM Polling Trigger

**Purpose**: Start workflows based on new or changed Ivanti records

**Icon**: Ivanti Neurons logo with trigger indicator

**Use Cases**:
- React to new incidents
- Monitor change approvals
- Track service request status
- Implement SLA monitoring

**How It Works**:
1. Polls the Ivanti OData API at configurable intervals
2. Compares results against previous poll using `RecId`
3. Emits only new/changed records
4. Stores state in workflow static data for deduplication

### 3. Ivanti Neurons for ITSM Connector (Action Node)

**Purpose**: Report automation job results back to Ivanti

**Icon**: SYNERGY logo

**Use Cases**:
- Complete automation transactions
- Report workflow execution status
- Provide traceability links

**Note**: Requires the Ivanti Neurons Connector package installed on your Ivanti instance. Contact [SYNERGY](https://www.synergy.eu/) for details.

### 4. Ivanti Neurons for ITSM Connector Trigger

**Purpose**: Receive webhook calls from Ivanti automation runbooks

**Icon**: SYNERGY logo with trigger indicator

**Use Cases**:
- Trigger workflows from Ivanti automations
- Execute complex multi-system workflows
- Implement custom automation logic

**Security Features**:
- Workflow ID validation (prevents cross-workflow replay)
- Authentication validation (Basic or custom header)
- Transaction state validation
- Parameter type validation

---

## Credentials Setup

### Ivanti Neurons for ITSM API

This credential is used by the main action nodes and polling trigger.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| **Tenant** | string | Your Ivanti hostname (without protocol) | `mytenant.ivanticloud.com` |
| **API Key** | password | Your Ivanti REST API key | `abc123...xyz789` |
| **Is On Prem** | boolean | Enable for on-premises instances | `false` (cloud) / `true` (on-prem) |
| **Skip SSL Verification** | boolean | Disable SSL cert validation | `false` (recommended) |

#### Obtaining an API Key

**For Cloud Instances**:
1. Log into Ivanti Neurons for ITSM
2. Navigate to **Configure** → **Security** → **API Keys**
3. Click **Create API Key**
4. Assign appropriate permissions (typically "REST API User" role)
5. Copy the generated key

**For On-Premises Instances**:
1. Log into HEAT with admin credentials
2. Navigate to **Configuration** → **Security** → **REST API**
3. Create a new API key or use an existing one
4. Enable the `/HEAT` path prefix in credentials

#### Credential Testing

When you save the credential, n8n automatically tests it by making a `GET` request to:
```
https://{tenant}/api/odata/businessobject/Incidents?$top=1
```

If the test fails, check:
- Tenant hostname is correct (no protocol, no trailing slash)
- API key is valid and not expired
- User has "REST API User" role
- For on-prem: "Is On Prem" checkbox is enabled

---

### Ivanti Neurons for ITSM Connector Auth

This credential is used by the webhook trigger to validate inbound requests.

| Field | Type | Description |
|-------|------|-------------|
| **Type** | dropdown | Authentication method: `Base`, `Header`, or `API Key` |
| **Username** | string | Used for Basic Auth (when Type = Base) |
| **Password** | password | Used for Basic Auth (when Type = Base) |
| **Header** | string | Custom header name (when Type = Header) |
| **Webhook API Key** | password | Token value for Header or API Key auth |

#### Authentication Methods

**Basic Authentication**:
```http
Authorization: Basic base64(username:password)
```
Used when Ivanti automation sends standard HTTP Basic Auth.

**Custom Header**:
```http
X-Custom-Auth: your-secret-token
```
Used when you define a custom authentication header.

**API Key**:
```http
Authorization: your-api-key
```
Simple bearer-style authentication.

---

## Resources & Operations

### Business Object

Interact with any Ivanti OData business object. Common objects include:
- `Incidents`
- `Changes`
- `ServiceReqs`
- `Problems`
- `Employees`
- `Teams`
- `ConfigurationItems`

> **Important**: Business object names must be **plural** and end with `s`.

#### Operations

##### Get Many

Retrieve multiple records with powerful filtering and pagination.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Plural entity name (e.g., `Incidents`) |
| Return All | boolean | If true, fetch all records across all pages |
| Limit | number | Max records to return (when Return All = false) |
| Select All Fields | boolean | Return all fields or specify subset |
| Select Fields | collection | Array of field names to return |
| OData Filter | collection | Structured filters (field, operator, value) |
| Order By | string | Field name for sorting |
| Order Direction | dropdown | `asc` or `desc` |

**Example OData Filter**:
```
Field Name: Priority
Field Type: string
Operation: eq
Value: High
Logical Operator: and

Field Name: Status
Field Type: string
Operation: ne
Value: Closed
```

This generates:
```
$filter=Priority eq 'High' and Status ne 'Closed'
```

**n8n Expression Example**:
```javascript
// In Select Fields
{{ $json.fieldList.split(',') }}

// In Order By
{{ $json.sortField || 'CreatedDateTime' }}
```

---

##### Get By Record ID

Fetch a single record by its unique identifier.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Plural entity name |
| Record ID | string | The GUID of the record |
| Select All Fields | boolean | Return all fields or subset |
| Select Fields | collection | Fields to return |

**Example**:
```
Business Object: Incidents
Record ID: 8A7F6E5D4C3B2A1F8A7F6E5D4C3B2A1F
```

**n8n Expression**:
```javascript
// Use RecId from previous node
{{ $('Trigger').item.json.RecId }}
```

---

##### Create

Create a new record in the business object.

**Input Modes**:
- **Define Below**: Use structured fields
- **Raw JSON**: Paste complete JSON body

**Parameters (Define Below mode)**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Plural entity name |
| Mode 
| Fields | collection | Array of field name/value pairs |

**Example Fields**:
```
Field Name: Subject
Field Value: New incident from n8n

Field Name: Priority
Field Value: High

Field Name: Category
Field Value: Hardware

Field Name: Status
Field Value: Active
```

**Raw JSON Example**:
```json
{
  "Subject": "Network connectivity issue",
  "Priority": "High",
  "Category": "Network",
  "Status": "Active",
  "Owner": "admin@company.com",
  "Description": "Users cannot access shared drives"
}
```

**Common Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Subject` | string | Yes* | Title/subject line |
| `Description` | string | No | Detailed description |
| `Priority` | string | No | Priority level |
| `Category` | string | No | Categorization |
| `Status` | string | Yes* | Current status |
| `Owner` | string | No | Assigned user email |
| `Team` | string | No | Assigned team |

*Required fields vary by object and configuration

---

##### Update

Update an existing record.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Plural entity name |
| Record ID | string | The GUID to update |
| Input Mode | dropdown | Define Below or Raw JSON |
| Fields | collection | Fields to update |

**Important**: Only fields you specify are updated. Omitted fields remain unchanged.

**Example**:
```
Record ID: {{ $json.RecId }}
Fields:
  - Status: Resolved
  - Resolution: Applied Windows updates
  - ResolvedDateTime: {{ $now.toISO() }}
```

---

##### Delete By Record ID

Permanently delete a record.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Plural entity name |
| Record ID | string | The GUID to delete |

**Warning**: This operation is **irreversible**. Consider updating status instead.

---

##### Search By Keyword

Search records using OData's `$search` parameter.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Plural entity name |
| Search Term | string | Keyword or phrase to search |
| Return All | boolean | Fetch all results or limit |
| Limit | number | Max results |

**Example**:
```
Business Object: Incidents
Search Term: printer offline
Limit: 20
```

This searches across all searchable fields (Subject, Description, etc.) for the term "printer offline".

**n8n Expression**:
```javascript
// Search from user input
{{ $('Webhook').item.json.body.searchQuery }}
```

---

### Attachment

Manage file attachments on business object records.

#### Upload

Upload a file to a record.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Parent object (e.g., `Incidents`) |
| Record ID | string | Parent record GUID |
| Binary Property | string | Name of n8n binary property |
| File Name | string | Optional: override filename |

**Workflow Example**:
```
┌───────────────┐    ┌──────────────┐    ┌────────────────┐
│ HTTP Request  │───▶│ Read Binary  │───▶│ Upload         │
│ Download File │    │ File         │    │ Attachment     │
└───────────────┘    └──────────────┘    └────────────────┘
```

**Binary Property**: Usually `data` (the default binary property name).

**Supported File Types**: All file types supported by Ivanti (PDFs, images, Office docs, logs, etc.)

---

#### Read

Download an attachment from a record.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Attachment ID | string | The attachment GUID |
| Binary Property | string | Output binary property name |

**Output**: The file is returned in the specified binary property, ready for:
- Sending via email
- Uploading to another system
- Processing with other n8n nodes

**Example**:
```javascript
// Attachment ID from Get Related operation
{{ $json.attachments[0].RecId }}
```

---

#### Delete

Remove an attachment from a record.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Attachment ID | string | The attachment GUID |

**Use Case**: Clean up outdated attachments, remove duplicates, etc.

---

### Relationship

Navigate and manage OData relationships between business objects.

#### Get Related

Traverse a relationship and fetch related records.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Source object |
| Record ID | string | Source record GUID |
| Relationship Name | string | Navigation property name |
| Merge Results | boolean | Merge related data into source item |
| Return All | boolean | Fetch all related or limit |
| Limit | number | Max related records |

**Common Relationships**:
| Object | Relationship | Returns |
|--------|--------------|---------|
| `Incidents` | `Attachments` | All attachments |
| `Incidents` | `OwnerTeam` | The team object |
| `Incidents` | `ChildIncidents` | Related child incidents |
| `Changes` | `RelatedIncidents` | Associated incidents |
| `ServiceReqs` | `ServiceReqTemplateDetails` | Template definition |

**Merge Results Example**:
```javascript
// With Merge Results = true
{
  "RecId": "incident-guid",
  "Subject": "Printer issue",
  "Attachments": [
    { "RecId": "attach-1", "FileName": "screenshot.png" },
    { "RecId": "attach-2", "FileName": "error-log.txt" }
  ]
}
```

---

#### Link

Create an OData `$ref` association between two records.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Source object |
| Record ID | string | Source record GUID |
| Relationship Name | string | Navigation property |
| Target Record ID | string | Target record GUID |

**Example Use Case**:
Link an incident to a change record:
```
Business Object: Incidents
Record ID: incident-guid
Relationship Name: RelatedChanges
Target Record ID: change-guid
```

---

#### Unlink

Remove an OData `$ref` association.

**Parameters**: Same as Link operation.

**Example**:
```javascript
// Remove attachment reference
Business Object: Incidents
Record ID: {{ $json.incidentId }}
Relationship Name: Attachments
Target Record ID: {{ $json.attachmentId }}
```

---

### Service Request

Programmatically create and manage service requests from the service catalog.

#### Get Subscription

Retrieve available service catalog offerings for an employee.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Profile Link | string | Employee GUID or email |

**Returns**: Array of service request templates the employee can access.

**Example**:
```javascript
Profile Link: john.doe@company.com
```

---

#### Get Service Request Parameters

Fetch the input parameters for a service request template.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Template ID | string | Service request template GUID |

**Returns**: Schema defining required and optional fields.

**Use Case**: Dynamically build forms or validate inputs before creating service requests.

---

#### Create

Submit a new service request.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Template | resource-locator | Select from published templates (`serviceReqTemplateId`) |
| Employee RecId | string (required) | GUID of the employee the request is created for (e.g. `07E1BD1BF5804E67B8E76B26FA6EF9A0`). Sent as `serviceReqData.ProfileLink_RecID` and `strUserId`. |
| Subscription ID | string (required) | GUID of the catalogue subscription (e.g. `07E1BD1BF5804E67B8E76B26FA6EF9A0`). Sent as `subscriptionId`. |
| Mode | dropdown | `Manual` (resource mapper form) or `JSON` (raw parameters object) |
| Parameters | resource-mapper | Dynamic form based on template (shown when Mode = `Manual`) |
| JSON | json | Raw parameters object (shown when Mode = `JSON`) |
| Optional Parameters | fixedCollection | `Local Offset`, `Employee Location`, `Symptom`, `Subject` |

**Manual mode**: Automatically loads the template schema and presents a form with all required/optional parameters.

**JSON mode**: The Template, Employee RecId and Subscription ID are still taken
from their own fields. The **JSON** input supplies only the inner `parameters`
object that is sent as `body.parameters`. Keys must use the parameter RecId in
the form `par-{recId}` for plain values and `par-{recId}-recId` for
dropdown/option values (the same keys the resource mapper produces in Manual
mode). Use **Get Service Request Parameters** to discover the RecIds.

**JSON Example** (value of the JSON field):
```json
{
  "par-1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D": "Microsoft Office 365",
  "par-9F8E7D6C5B4A39281706F5E4D3C2B1A0-recId": "11223344556677889900AABBCCDDEEFF"
}
```

---

### Search

Advanced search capabilities across the Ivanti platform.

#### Full Text Search in Single Object

Search within a specific business object type.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Object to search |
| Search Text | string | Search query |
| Return All | boolean | All results or limit |
| Limit | number | Max results |

**Search Syntax**:
- Simple keyword: `printer`
- Multiple words: `printer offline error`
- Phrase: `"out of paper"`
- Boolean: `printer AND (offline OR error)`

---

#### Full Text Search Across All Objects

Search across all business object types simultaneously.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Search Text | string | Search query |

**Returns**: Results grouped by object type.

**Use Case**: Global search, knowledge base queries, cross-object discovery.

---

#### Saved Search

Execute a pre-configured saved search.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Object type of saved search |
| Search Name | string | Display name of search |
| Search ID | string | GUID of saved search |

**Use Case**: Leverage complex searches configured in Ivanti UI without recreating filter logic.

---

### Quick Action

Execute Ivanti quick actions on records.

#### Run

Trigger a named quick action.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Business Object | string | Target object type |
| Record ID | string | Target record GUID |
| Quick Action Name | string | Name of action to execute |

**Common Quick Actions**:
- `Assign to Me`
- `Take Ownership`
- `Escalate`
- `Resolve`
- `Cancel`

**Example**:
```javascript
Business Object: Incidents
Record ID: {{ $json.RecId }}
Quick Action Name: Assign to Me
```

---

### Automation (Connector Node Only)

#### Report Transaction

Report the outcome of an Ivanti automation workflow back to the platform.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Transaction ID | string | Automation transaction GUID |
| Status | dropdown | Completed, Failed, or Aborted |
| Job Result | string | Result message or error details |

**Automatic Features**:
- Embeds n8n execution URL for traceability
- Updates transaction status in Ivanti
- Provides audit trail

**Example**:
```javascript
Transaction ID: {{ $('Trigger').item.json.TransactionId }}
Status: Completed
Job Result: Successfully provisioned user account
```

---

## Usage Examples

### Example 1: Auto-Assign High Priority Incidents

Monitor for new high-priority incidents and auto-assign to the on-call team.

```
┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Polling Trigger  │────▶│ Filter (IF)      │────▶│ Update Incident │
│ Poll: Incidents  │     │ Priority = High  │     │ Set: Team       │
│ Every 5 min      │     └──────────────────┘     └─────────────────┘
└──────────────────┘              │
                                  │ (else)
                                  ▼
                          ┌──────────────────┐
                          │ No Operation     │
                          └──────────────────┘
```

**Polling Trigger Configuration**:
```
Business Object: Incidents
Return All: false
Limit: 50
OData Filter:
  - Priority eq 'High'
  - Status eq 'Active'
Order By: CreatedDateTime
Order Direction: desc
```

**Update Incident**:
```
Record ID: {{ $json.RecId }}
Fields:
  - OwnerTeam: On-Call Engineering
  - Status: In Progress
```

---

### Example 2: Incident Enrichment with External Data

Enrich incidents with asset data from an external CMDB.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Webhook Trigger  │────▶│ HTTP Request     │────▶│ Update Incident  │
│ New Incident     │     │ Get Asset Info   │     │ Add Details      │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

**HTTP Request**:
```javascript
Method: GET
URL: https://cmdb.company.com/api/assets/{{ $json.ConfigItemRecId }}
Authentication: API Key
```

**Update Incident**:
```javascript
Record ID: {{ $('Webhook Trigger').item.json.RecId }}
Fields (Raw JSON):
{
  "AssetSerialNumber": "{{ $json.serialNumber }}",
  "AssetLocation": "{{ $json.location }}",
  "AssetOwner": "{{ $json.owner }}",
  "WarrantyExpiration": "{{ $json.warrantyExpiry }}"
}
```

---

### Example 3: Service Request Approval Workflow

Route service requests through Slack for approval.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Polling Trigger  │────▶│ Slack Message    │────▶│ Wait for Webhook │
│ New ServiceReqs  │     │ Approval Request │     │ Slack Response   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                            │
                                                            ▼
                                                   ┌──────────────────┐
                                                   │ IF Node          │
                                                   │ Check Response   │
                                                   └──────────────────┘
                                                     │              │
                                        (approved)   │              │ (rejected)
                                                     ▼              ▼
                                          ┌──────────────┐  ┌─────────────┐
                                          │ Update to    │  │ Update to   │
                                          │ Approved     │  │ Rejected    │
                                          └──────────────┘  └─────────────┘
```

---

### Example 4: Automated Documentation Upload

Automatically attach resolution documentation to resolved incidents.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Polling Trigger  │────▶│ HTTP Request     │────▶│ Upload           │
│ Resolved         │     │ Generate Report  │     │ Attachment       │
│ Incidents        │     │ (PDF API)        │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

**HTTP Request** (example with a PDF generation service):
```javascript
Method: POST
URL: https://pdf-service.company.com/generate
Body:
{
  "template": "incident-resolution",
  "data": {
    "incidentId": "{{ $json.IncidentNumber }}",
    "subject": "{{ $json.Subject }}",
    "resolution": "{{ $json.Resolution }}",
    "resolvedBy": "{{ $json.ResolvedBy }}",
    "resolvedDate": "{{ $json.ResolvedDateTime }}"
  }
}
```

**Upload Attachment**:
```javascript
Business Object: Incidents
Record ID: {{ $('Polling Trigger').item.json.RecId }}
Binary Property: data
File Name: Resolution-{{ $json.IncidentNumber }}.pdf
```

---

### Example 5: SLA Monitoring and Escalation

Automatically link related incidents from external monitoring systems to Ivanti incidents.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Webhook Trigger  │────▶│ Search Ivanti    │────▶│ IF Node          │
│ Alert from       │     │ Search By        │     │ Incident Exists? │
│ Monitoring Tool  │     │ Keyword          │     └──────────────────┘
└──────────────────┘     └──────────────────┘              │
                                                   ┌────────┴────────┐
                                          (found)  │                 │ (not found)
                                                   ▼                 ▼
                                          ┌──────────────┐  ┌──────────────┐
                                          │ Update       │  │ Create New   │
                                          │ Incident     │  │ Incident     │
                                          │ Add Note     │  │              │
                                          └──────────────┘  └──────────────┘
                                                   │                 │
                                                   └────────┬────────┘
                                                            ▼
                                                   ┌──────────────────┐
                                                   │ Upload           │
                                                   │ Attachment       │
                                                   │ (Alert Details)  │
                                                   └──────────────────┘
```

**Webhook Payload** (from monitoring system):
```json
{
  "alert_id": "ALT-12345",
  "severity": "critical",
  "hostname": "web-server-01",
  "message": "High CPU usage detected",
  "metric_value": "95%",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Search Ivanti** (Search By Keyword):
```javascript
Business Object: Incidents
Search Term: {{ $json.hostname }}
Limit: 10
```

**IF Node** (Check if incident exists):
```javascript
{{ $('Search Ivanti').item.json.Status === 'Active' }}
```

**Create New Incident** (if not found):
```javascript
Business Object: Incidents
Fields (Raw JSON):
{
  "Subject": "{{ $('Webhook Trigger').item.json.message }} - {{ $('Webhook Trigger').item.json.hostname }}",
  "Description": "Alert received from monitoring system\n\nAlert ID: {{ $json.alert_id }}\nSeverity: {{ $json.severity }}\nMetric: {{ $json.metric_value }}\nTimestamp: {{ $json.timestamp }}",
  "Priority": "{{ $json.severity === 'critical' ? 'High' : 'Medium' }}",
  "Category": "Infrastructure",
  "Status": "Active",
  "Source": "Monitoring System"
}
```

**Update Incident** (if found - add note):
```javascript
Record ID: {{ $('Search Ivanti').item.json.RecId }}
Fields:
  - WorkNotes: "Additional alert received at {{ $now.toISO() }}\nAlert ID: {{ $('Webhook Trigger').item.json.alert_id }}\nMetric: {{ $('Webhook Trigger').item.json.metric_value }}"
```

---

## Advanced Topics

### Working with OData

Ivanti uses OData (Open Data Protocol) for its REST API. Understanding OData query syntax helps you build powerful filters and queries.

#### Select Specific Fields

```
$select=RecId,Subject,Priority,Status,CreatedDateTime
```

In n8n: Add fields in "Select Fields" collection.

#### Filter Results

```
$filter=Priority eq 'High' and Status ne 'Closed'
```

In n8n: Use "OData Filter" collection.

**Operators**:
- `eq` (equals)
- `ne` (not equals)
- `gt` (greater than)
- `ge` (greater than or equal)
- `lt` (less than)
- `le` (less than or equal)
- `and`, `or`, `not` (logical)

**Functions**:
- `contains(field, 'text')` - substring match
- `startswith(field, 'text')` - prefix match
- `endswith(field, 'text')` - suffix match

#### Order Results

```
$orderby=CreatedDateTime desc
```

In n8n: Use "Order By" and "Order Direction" fields.

#### Pagination

OData uses `$top` and `$skip` for pagination:
```
$top=50&$skip=100
```

The nodes handle pagination automatically when "Return All" is enabled.

---

### Error Handling

All nodes throw detailed errors for troubleshooting.

#### Common Error Patterns

**Authentication Errors**:
```
Error: Unauthorized (401)
```
- Check API key is valid
- Verify user has "REST API User" role
- For on-prem: enable "Is On Prem" in credentials

**Not Found Errors**:
```
Error: Not Found (404)
```
- Verify business object name is plural (e.g., `Incidents` not `Incident`)
- Check record ID is valid GUID
- Ensure record exists and user has access

**Validation Errors**:
```
Error: Bad Request (400) - Field 'Priority' is required
```
- Review required fields for the object
- Check field names match exactly (case-sensitive)
- Validate data types (string, number, date)

#### Error Handling Workflow Pattern

```
┌──────────────────┐
│ Try              │
│ Ivanti Operation │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│ Error Trigger    │
│ On Error         │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│ Log to Database  │
│ or Monitoring    │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│ Send Alert       │
└──────────────────┘
```

Use n8n's built-in error workflows to handle failures gracefully.

---

### Performance Optimization

#### Batch Processing

Process multiple records in a single workflow execution:

```javascript
// Code node to batch process
const items = $input.all();
const batchSize = 10;
const batches = [];

for (let i = 0; i < items.length; i += batchSize) {
  batches.push(items.slice(i, i + batchSize));
}

return batches.map(batch => ({ json: { items: batch } }));
```

#### Selective Field Retrieval

Only fetch fields you need to reduce payload size and improve speed:

```
Select All Fields: false
Select Fields:
  - RecId
  - Subject
  - Status
  - Priority
```

#### Polling Optimization

For polling triggers:
- Set appropriate intervals (avoid polling every minute if not needed)
- Use OData filters to reduce result set
- Limit results to reasonable numbers (50-100)
- Monitor for performance issues in Ivanti logs

---

### Security Best Practices

1. **Credential Management**
   - Never hardcode API keys in workflows
   - Use n8n credential system
   - Rotate API keys regularly
   - Use separate keys for dev/staging/production

2. **Webhook Security**
   - Always enable authentication on webhook triggers
   - Use HTTPS endpoints only
   - Validate workflow ID header
   - Implement rate limiting if needed

3. **Access Control**
   - Use least-privilege API keys
   - Restrict API user permissions in Ivanti
   - Audit API key usage regularly
   - Disable unused credentials

4. **Data Protection**
   - Be cautious with sensitive data in workflows
   - Use n8n's workflow permissions
   - Avoid logging sensitive information
   - Implement data retention policies

---

## Troubleshooting

### Connection Issues

**Problem**: Credential test fails with timeout

**Solutions**:
- Verify tenant hostname is reachable
- Check firewall rules allow outbound HTTPS
- For on-prem: ensure VPN is connected
- Test manually with curl:
  ```bash
  curl -H "Authorization: rest_api_key=YOUR_KEY" \
       https://YOUR_TENANT/api/odata/businessobject/Incidents?$top=1
  ```

---

### SSL Certificate Errors

**Problem**: `UNABLE_TO_VERIFY_LEAF_SIGNATURE` or similar SSL errors

**Solutions**:
- For self-signed certificates: enable "Skip SSL Verification"
- For production: install proper SSL certificate on Ivanti
- Check certificate expiration date
- Verify certificate chain is complete

---

### Polling Trigger Not Finding New Records

**Problem**: New incidents exist but trigger doesn't fire

**Solutions**:
- Check OData filter syntax is correct
- Verify records match filter criteria
- Ensure `RecId` field is included in select
- Review workflow execution history for errors
- Test filter manually in Ivanti OData URL:
  ```
  https://tenant/api/odata/businessobject/Incidents?$filter=YOUR_FILTER
  ```

---

### Webhook Trigger Returns 400

**Problem**: Ivanti automation gets 400 Bad Request

**Solutions**:
- Verify `Content-Type: application/json` header is set
- Check `X-Workflow-Id` matches the n8n workflow ID
- Validate authentication header format
- Ensure all required parameters are in request body
- Check parameter types match configuration
- Review n8n execution logs for specific validation error

---

### Create/Update Operations Fail

**Problem**: `Bad Request (400) - Invalid field` errors

**Solutions**:
- Check field names are spelled correctly (case-sensitive)
- Verify field exists in the business object
- Ensure field is not read-only
- Validate data types (date fields need ISO format)
- Review Ivanti field permissions
- Use "Get By Record ID" to see existing field structure

---

### Attachment Upload Fails

**Problem**: Attachment upload returns error

**Solutions**:
- Verify binary data exists in specified property
- Check file size doesn't exceed Ivanti limits
- Ensure parent record exists
- Validate record ID is correct
- Test with small file first (<1MB)
- Check Ivanti attachment configuration and limits

---

### Performance Issues

**Problem**: Workflows run slowly or timeout

**Solutions**:
- Reduce number of fields selected
- Implement pagination for large result sets
- Use filters to reduce data volume
- Batch process instead of item-by-item
- Check Ivanti server performance
- Review n8n execution queue length
- Consider scaling n8n horizontally

---

## Best Practices

### Workflow Design

1. **Use Descriptive Names**
   - Name nodes clearly: "Get High Priority Incidents" not "Ivanti 1"
   - Add notes to complex nodes
   - Document workflow purpose in workflow description

2. **Error Handling**
   - Always implement error workflows
   - Log errors to external system
   - Send alerts for critical failures
   - Include context in error messages

3. **Testing**
   - Test with small data sets first
   - Use n8n's test execution mode
   - Validate outputs at each node
   - Test error scenarios

4. **Modularity**
   - Break complex workflows into sub-workflows
   - Use Execute Workflow node for reusable logic
   - Keep workflows focused on single responsibility

---

### Data Management

1. **Field Selection**
   - Only fetch fields you need
   - Use `$select` to reduce payload
   - Consider network and processing costs

2. **Filtering**
   - Apply filters server-side (OData) not client-side
   - Use indexed fields in filters when possible
   - Avoid filtering large result sets in Code nodes

3. **Pagination**
   - Use limits for large queries
   - Process in batches if needed
   - Monitor memory usage with large data sets

---

### Maintenance

1. **Monitoring**
   - Set up workflow execution monitoring
   - Track success/failure rates
   - Monitor execution times
   - Alert on anomalies

2. **Updates**
   - Keep n8n and community nodes updated
   - Review changelog for breaking changes
   - Test updates in non-production first
   - Have rollback plan

3. **Documentation**
   - Document custom workflows
   - Maintain runbooks for common issues
   - Keep credential information updated
   - Document dependencies

---

## API Reference

### Base URLs

**Cloud Instances**:
```
https://{tenant}/api
```

**On-Premises Instances**:
```
https://{tenant}/HEAT/api
```

### Endpoints Used

> All paths below are relative to the base URL above. The node automatically
> prepends `/api` (cloud) or `/HEAT/api` (on-premises) to every path, so do **not**
> add `/api` yourself.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/odata/businessobject/{object}` | GET | Query records (Get Many) |
| `/odata/businessobject/{object}` | POST | Create record |
| `/odata/businessobject/{object}('{id}')` | GET | Get single record |
| `/odata/businessobject/{object}('{id}')` | PUT | Update record |
| `/odata/businessobject/{object}('{id}')` | DELETE | Delete record |
| `/odata/businessobject/{object}('{id}')/{relationship}` | GET | Get related records |
| `/odata/businessobject/{object}('{recordId}')/{relationship}('{targetId}')/$Ref` | PATCH | Link records |
| `/odata/businessobject/{object}('{recordId}')/{relationship}('{targetId}')/$Ref` | DELETE | Unlink records |
| `/odata/businessobject/{object}('{recordId}')/{quickAction}` | POST | Run quick action |
| `/odata/businessobject/{object}/{savedSearchName}?ActionId={guid}` | GET | Run saved search |
| `/rest/Attachment` | POST | Upload attachment (multipart/form-data) |
| `/rest/Attachment?ID={id}` | GET | Download attachment |
| `/rest/Attachment?ID={id}` | DELETE | Delete attachment |
| `/rest/search/fulltext` | POST | Full-text search in a single object |
| `/rest/Search` | POST | Full-text search across all objects |
| `/odata/businessobject/ServiceReqTemplateParams` | GET | Get service request template parameters |
| `/rest/Template/{employeeId}/_All_` | GET | Get service request subscriptions/templates |
| `/rest/ServiceRequest/new` | POST | Create service request |

### Rate Limits

Ivanti API rate limits vary by instance and license. Contact your Ivanti administrator for details.

**Typical Limits**:
- Cloud: 100 requests/minute per API key
- On-Premises: Configurable, typically 500 requests/minute

**Best Practices**:
- Implement exponential backoff on 429 errors
- Cache results when appropriate
- Batch operations when possible

---

## FAQ

### General Questions

**Q: Which Ivanti versions are supported?**

A: This package supports Ivanti Neurons for ITSM (cloud and on-premises). Tested with versions 2021.3 and later. Some features may require specific Ivanti modules or licenses.

**Q: Can I use this with Ivanti Service Manager (ISM)?**

A: Yes, Ivanti Neurons for ITSM is the evolution of ISM. The nodes work with both branding variants.

---

### Credentials & Authentication

**Q: Where do I find my API key?**

A: In Ivanti, navigate to **Configure** → **Security** → **API Keys**. You need admin or appropriate security permissions.

**Q: Can I use OAuth instead of API keys?**

A: Not currently supported. Ivanti REST API primarily uses API key authentication.

**Q: My API key expired. What happens?**

A: Workflows will fail with 401 Unauthorized errors. Generate a new key in Ivanti and update the credential in n8n.

---

### Operations & Functionality

**Q: Can I query custom business objects?**

A: Yes! Use the plural name of your custom object (e.g., `CustomObjects`).

**Q: How do I find available relationships?**

A: Use the Ivanti OData metadata endpoint:
```
https://tenant/api/odata/$metadata
```
Or query a record and examine the navigation properties.

**Q: Can I execute Ivanti workflows from n8n?**

A: Not directly via API. Use Quick Actions or create automation runbooks that call n8n webhooks.

---

### Polling & Triggers

**Q: How often should I poll?**

A: Depends on your SLA requirements. Common intervals:
- Critical workflows: 1-2 minutes
- Normal workflows: 5-15 minutes
- Batch processing: hourly or daily

**Q: Does polling create duplicate executions?**

A: No, the trigger tracks seen `RecId` values to prevent duplicates.

**Q: Can I reset polling state?**

A: Yes, deactivate and reactivate the workflow. Or manually edit workflow static data in n8n database.

---

### Performance

**Q: Why are my queries slow?**

A: Common causes:
- Fetching too many fields (use `$select`)
- No filters (always filter when possible)
- Large result sets (use pagination)
- Ivanti server performance issues

**Q: Can I run queries in parallel?**

A: Yes, use n8n's Split In Batches node and parallel execution settings.

---

### Troubleshooting

**Q: I get "Business object must end with 's'" error**

A: Ivanti OData uses plural entity names. Use `Incidents` not `Incident`.

**Q: SSL verification fails on my on-prem instance**

A: Enable "Skip SSL Verification" in credentials. For production, install proper SSL certificate.

**Q: Webhook trigger returns 400 Bad Request**

A: Common causes:
- Missing `Content-Type: application/json` header
- Wrong `X-Workflow-Id` header
- Invalid authentication
- Missing required parameters

---

## Support & Contributing

### Getting Help

1. **Documentation**: Start with this README and [n8n docs](https://docs.n8n.io/)
2. **Community**: Ask questions in [n8n community forum](https://community.n8n.io/)
3. **Issues**: Report bugs on [GitHub Issues](https://github.com/KonstantinShturo/n8n-nodes-ivanti-neurons-for-itsm/issues)
4. **Support**: For Connector nodes, contact [SYNERGY](mailto:support@synergy.eu)

### Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests if applicable
5. Run linter: `npm run lint`
6. Build: `npm run build`
7. Submit a pull request

### Reporting Bugs

When reporting bugs, include:
- n8n version
- Node package version
- Ivanti version (cloud/on-prem)
- Workflow JSON (redact sensitive data)
- Error messages and logs
- Steps to reproduce

### Feature Requests

Have an idea? Open a GitHub issue with:
- Use case description
- Proposed functionality
- Example workflows
- Relevant Ivanti API documentation

---

## License

[MIT](LICENSE.md)

Copyright (c) 2024 SYNERGY

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## Acknowledgments

- Built for the [n8n](https://n8n.io/) community
- Integrates with [Ivanti Neurons for ITSM](https://www.ivanti.com/products/neurons-for-itsm)
- Developed and maintained by [SYNERGY](https://www.synergy.eu/)

---

**Made with ❤️ for IT automation**
