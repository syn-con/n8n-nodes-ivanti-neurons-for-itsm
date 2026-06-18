# Finding 37: Service Request 'Raw JSON' example and parameters table do not match what the node sends

| Field | Value |
|---|---|
| Category | Documentation Accuracy (README/CHANGELOG) |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:659-679, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:28-102, 205-301 |

## Problem

The README documentation for **Service Request → Create** describes inputs and a JSON body that the node never produces or accepts. Three concrete mismatches exist.

**1. The parameters table omits two required fields and mislabels the mode options.**

README.md:659-664:
```markdown
**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Input Mode | dropdown | Resource Mapper or Raw JSON |
| Template | resource-locator | Select from published templates |
| Parameters | resource-mapper | Dynamic form based on template |
```

But the operation defines two additional **required** properties that the table never mentions, and the mode dropdown labels are `Manual`/`JSON`, not `Resource Mapper`/`Raw JSON`.

create.operation.ts:32-57:
```typescript
		displayName: 'Employee RecId',
		name: 'employeeId',
		type: 'string',
		required: true,
...
		displayName: 'Subscription ID',
		name: 'subscriptionId',
		type: 'string',
		required: true,
...
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'manual',
		...
		options: [
			{ name: 'Manual', value: 'manual' },
			{ name: 'JSON', value: 'json' },
		],
```

**2. The "Raw JSON Example" shows a top-level body that the node never sends.**

README.md:668-679:
```json
{
  "ServiceReqTemplateId": "template-guid",
  "RequestedFor": "john.doe@company.com",
  "Parameters": {
    "SoftwareName": "Microsoft Office 365",
    "LicenseType": "E3",
    "Justification": "New employee onboarding"
  }
}
```

None of these keys (`ServiceReqTemplateId`, `RequestedFor`, `Parameters`, or the friendly inner names like `SoftwareName`) appear anywhere in the request. The node always builds a fixed envelope and posts it to `/rest/ServiceRequest/new`.

create.operation.ts:205-219:
```typescript
			const body: IDataObject = {
				"attachmentsToDelete": [],
				"attachmentsToUpload": [],
				"delayedFulfill": false,
				"formName": "ServiceReq.ResponsiveAnalyst.DefaultLayout",
				"saveReqState": false,
				"serviceReqData": {
					"ProfileLink_RecID": employeeId,
					"ProfileLink_Category": "Employee",
					"Subject": (optionalParameters.subject as string) || '',
					"Symptom": (optionalParameters.symptom as string) || ''
				},
				"subscriptionId": subscriptionId,
				"strUserId": employeeId,
			};
```

**3. The JSON-mode input only supplies the inner `parameters` object, keyed by `par-{recId}` / `par-{recId}-recId`, not friendly names.**

In JSON mode the `jsonParameters` value is used verbatim as `body["parameters"]`, and in manual mode the keys are transformed to `par-{recId}` / `par-{recId}-recId`.

create.operation.ts:232 and 277-298:
```typescript
		body["parameters"] = await resolveParameters.call(this, i, mode, serviceReqTemplateId);
```
```typescript
	if (mode === 'json') {
		return this.getNodeParameter('jsonParameters', itemIndex, {}) as IDataObject;
	}
	...
		if (key.endsWith('_option')) {
			parameters[`par-${recId}-recId`] = value;
		} else {
			parameters[`par-${key}`] = value;
		}
```

So the JSON the user must supply is the inner parameters map (e.g. `{ "par-AB12...": "value", "par-CD34...-recId": "recId-value" }`), not a top-level object with `ServiceReqTemplateId`/`RequestedFor`/`Parameters`.

## Why it matters

This is purely a documentation-accuracy defect, but the impact on users is concrete:

- A user who copies the README "Raw JSON Example" verbatim into the JSON field will produce a request whose `parameters` object contains `ServiceReqTemplateId`, `RequestedFor`, and a nested `Parameters` object — none of which the Ivanti API recognizes as service-request parameters. The request will silently submit with no real parameter values (or fail server-side), wasting time debugging.
- The parameters table omits the two required string fields (`Employee RecId`, `Subscription ID`). A reader planning the node will not realize these GUIDs are mandatory, leading to runtime "required parameter" errors.
- The mode option names in the README (`Resource Mapper`, `Raw JSON`) do not match the actual UI labels (`Manual`, `JSON`), so the docs cannot be followed against the real node UI.

## Resolution

Edit only `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md`. No code change is required — the README must be brought in line with the code.

### Step 1 — Fix the parameters table (README.md:659-666)

BEFORE:
```markdown
**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Input Mode | dropdown | Resource Mapper or Raw JSON |
| Template | resource-locator | Select from published templates |
| Parameters | resource-mapper | Dynamic form based on template |

**Resource Mapper**: Automatically loads the template schema and presents a form with all required/optional parameters.
```

AFTER:
```markdown
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
```

### Step 2 — Replace the "Raw JSON Example" with a correct one (README.md:668-679)

The example must show only the inner parameters object, keyed by `par-{recId}` (regular fields) and `par-{recId}-recId` (dropdown/option fields), since that value is used directly as `body["parameters"]`.

BEFORE:
```markdown
**Raw JSON Example**:
```json
{
  "ServiceReqTemplateId": "template-guid",
  "RequestedFor": "john.doe@company.com",
  "Parameters": {
    "SoftwareName": "Microsoft Office 365",
    "LicenseType": "E3",
    "Justification": "New employee onboarding"
  }
}
```
```

AFTER:
```markdown
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

The node wraps this in the full request envelope before POSTing to
`/rest/ServiceRequest/new`:

```json
{
  "attachmentsToDelete": [],
  "attachmentsToUpload": [],
  "delayedFulfill": false,
  "formName": "ServiceReq.ResponsiveAnalyst.DefaultLayout",
  "saveReqState": false,
  "serviceReqData": {
    "ProfileLink_RecID": "<Employee RecId>",
    "ProfileLink_Category": "Employee",
    "Subject": "<optional Subject>",
    "Symptom": "<optional Symptom>"
  },
  "subscriptionId": "<Subscription ID>",
  "strUserId": "<Employee RecId>",
  "parameters": { "...": "..." }
}
```
```

The placeholder GUIDs above match the documented GUID format in the operation's field descriptions (create.operation.ts:36, 44). Keep them as illustrative placeholders; do not present them as real RecIds.

## Verification

This is a docs-only change, so verification is by inspection plus the repo's standard lint/build to confirm nothing else broke:

1. Open `README.md` around lines 655-680 and confirm:
   - The parameters table now lists `Employee RecId` and `Subscription ID` as required, and `Mode` options read `Manual`/`JSON` (matching create.operation.ts:32-57).
   - The JSON example shows only the inner `parameters` object keyed by `par-{recId}` / `par-{recId}-recId`, and the envelope block matches create.operation.ts:205-219.
2. Cross-check the documented key transformation against create.operation.ts:289-297 (`par-${recId}-recId` for `_option` keys, `par-${key}` otherwise).
3. Run the package lint/build to ensure the README edit did not disturb anything tracked by tooling (no source files changed):
   - `npm run lint` (or `npx n8n-node lint`)
   - `npm run build` (or `npx n8n-node build`)
   Both should pass unchanged, since only `README.md` was modified.

## Related findings

None.
