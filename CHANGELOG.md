# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-11-05

### Added
- **Attachment → Read** has a **Put Output File in Field** parameter for the binary field the file is written to (#30). It defaults to `data`, the field used so far
- The package ships a **LICENSE** file (MIT), and the README links it (#42)

### Changed
- The **Attachment** operations are named **Delete**, **Read** and **Upload** in the editor, without repeating "Attachment" (n8n review). Saved workflows are not affected
- **Business Object → Get Many** and **Polling Trigger** version **1.3**, JSON mode (#26): only `$filter`, `$select` and `$orderby` are accepted, with or without the `$` sign and in any letter case (`{"filter": "…"}` sends `$filter`). Ivanti ignores other keys, so a typo read every record silently; now `{"$filtr": "…"}` fails with "Unknown OData option: $filtr", the same option given twice is refused, and `$search`, which Ivanti does not support here, points to Search by Keyword. `$select` and `$orderby` may also be lists, such as `["LastModDateTime asc", "RecId asc"]`, sent joined with commas. The field help explains how to fill in values with an expression. Versions 1.1 and 1.2 still pass any key as written
- **Attachment → Read** keeps the input item's binary fields and adds the file beside them, instead of replacing them (#30). A field with the same name as the output field is still replaced
- **Attachment → Read** streams the download instead of reading the whole file into memory first (#30). With n8n's binary data kept on disk or in S3, a large attachment no longer has to fit in memory
- **Business Object → Search by Keyword**: the **Select Fields** names accept expressions, as in Get Many (#34)
- README: install steps use the scoped package name and n8n's documented manual and Docker installs; a new **Queue Mode** section says every worker and webhook process needs the package; **Rate Limits** no longer lists invented limits or a 429 back-off, and a new **API Limits** section covers paging, the filter operators and the 204 and 400 answers (#40)

### Fixed
- **Attachment → Read** reports Ivanti's own error, with its code and the HTTP status (for example `Ivanti API request failed (HTTP 400, ISM_4000): Attachment with ID … was not found`), instead of n8n's generic "The resource you are requesting could not be found" (#29). With Continue On Fail the item carries `httpCode`
- Every Ivanti error message now includes Ivanti's error code when the reply has one, shows the reply in the error details, and is shortened to 500 characters of reply text (#29). **Attachment → Upload** still lists the reason of each refused file
- **Attachment → Read** reads the file name as RFC 6266 describes (#30): UTF-8 names sent as `filename*=UTF-8''r%C3%A9sum%C3%A9.pdf` become `résumé.pdf`, and parameters after the name (`a.pdf"; size=1`) are no longer part of it
- **Service Request → Get Service Request Parameters** and **Create Service Request (Advanced)** (Manual mode), and the parameter lists in the editor, escape the template ID in their filter (#20). A quote no longer breaks the filter, and in the two operations a value that is not a RecId fails with a clear error instead of returning nothing
- An Ivanti error reply was shown as raw JSON text instead of its message; it is now parsed first (#31)
- The **Polling Trigger** subtitle no longer shows a poll interval parameter that does not exist, and the node documentation links point at the README instead of a placeholder site (#40)

## [1.6.0] - 2026-11-04

### Added
- **Polling Trigger** version **1.2** emits only records created or modified since the previous poll (#6). It remembers the `LastModDateTime` and `RecId` of the last record it emitted and reads on from there, in that order; your filter is kept and any Order By is replaced. The first poll after activation only records the starting point and emits nothing. With a Limit, the remaining records follow on the next polls. Testing the node in the editor shows the most recently modified records. Versions 1 and 1.1 still emit every matching record on every poll
- **Ivanti Neurons for ITSM** node version **1.2**: **Automation → Report Transaction** offers the statuses Ivanti uses, **Queued**, **Completed** (the new default), **Failed** and **Aborted** (#37). Versions 1 and 1.1 keep Pending, In Progress, Completed and Failed
- **Automation → Report Transaction** has a new **If Already Finished** option (#2). **Error** (the default) fails the item as before; **Skip** returns the transaction unchanged with `"alreadyFinished": true` and does not update it, for retries or a second branch reporting the same transaction

### Changed
- With Continue On Fail, every operation now carries on with the remaining items after one fails, and each error item is paired to its input item with `{ "error", "httpCode" }`, so `$('Node').item` keeps working (#3). **Business Object → Get Many**, **Search by Keyword**, **Search → Saved Search** and **Full Text Search Across All Objects** previously stopped at the first failure. Errors keep Ivanti's HTTP code and say which item failed
- **Connector Trigger**: authentication is checked first. A failed authentication answers **401** with no body (with `WWW-Authenticate: Basic` only for Basic auth); the other checks answer 400 with their message (#23). Header authentication now compares the key in constant time
- **Service Request → Create** and **Create (Simplified)**: the Optional Parameters Subject, Symptom, Employee Location and Local Offset are sent as plain values (#8). They were sent as lists of objects, which Ivanti refused. Local Offset 0 is now sent when added
- In JSON mode, an OData Query that is empty, `{}`, or resolves to nothing from an expression is refused with "The OData Query is empty", instead of reading the business object unfiltered (#5)
- Manual mode: Select Fields names, the Order By field and the Order Direction are validated; a direction other than `asc` or `desc` is refused instead of returning no records (#21)
- **Attachment → Read** and **Delete** (#11), **Business Object → Update** and **Delete** (#10), **Relationship → Unlink** and **Service Request → Get Subscriptions** (#9) check that record and attachment IDs are RecIds and encode them, and check business object and relationship names, before building the URL. Empty IDs are refused

### Fixed
- **Attachment → Upload** sends the form fields Ivanti documents (`ObjectID`, `ObjectType`, `File`), so the attachment is linked to the record (#43). A refused upload (HTTP 300, for example a file of that name already attached) now shows Ivanti's reason per file
- **Business Object → Search by Keyword** with Return All failed with "Could not get parameter limit" (#7). It also read Select Fields from the first item only
- **Polling Trigger**: an unset query parameter no longer falls back to `0`; with Select All Fields off and no fields, activation failed with "selectFieldsCollection.map is not a function" (#24)
- **Connector Trigger**: a tenant typed with `https://` or a trailing slash works for the transaction lookup (#22), and `Content-Type: application/json; charset=utf-8` is accepted (#32)
- **Search → Saved Search** and **Relationship → Get Related** return no items for an empty answer, instead of one item without data (#19)
- **Service Request → Create**: a numeric parameter value from an expression failed with "str.trim is not a function" (#18)
- **Automation → Report Transaction** reads Status per item (#2)
- **Business Object → Delete**: the default Business Object `incident` failed the operation's own check; the field now starts empty like in the other operations (#35)

### Removed
- The unused list search `getServiceReqTemplateParameters`, which could only return an empty list (#38)

## [1.5.0] - 2026-10-15

### Added
- New node version **1.1** for the **Ivanti Neurons for ITSM** node and the **Polling Trigger**. Workflows saved with version 1 keep working exactly as before; nodes added from now on use version 1.1
- Version 1.1 adds a **Mode** field to **Business Object → Get Many** and the **Polling Trigger**:
  - **Manual** – the existing field-by-field builder (Select Fields, OData Filter, Order By)
  - **JSON** – an **OData Query (JSON)** field holding native OData query options such as `$filter`, `$select` and `$orderby`. They are sent to Ivanti exactly as written, without validation or transformation, so any OData syntax Ivanti supports can be used (for example `contains(Subject,'printer')`). Paging stays with Return All and Limit, so `$top` and `$skip` are rejected with a clear error

### Removed
- In version 1.1, the **Define Filter as JSON** toggle and its **Raw Filter (JSON)** field are no longer shown; JSON mode replaces them. They remain available in version 1

## [1.4.3] - 2026-10-09

### Fixed
- **Service Request → Create** and **Create (Simplified)** now show Ivanti's actual reason when a service request is rejected. Ivanti returns the reason in the `ErrorText` field, but the node read `Message`, so the error always fell back to "Ivanti could not create the service request and did not return a reason"
- In JSON mode, the "JSON" field of both operations is now read correctly whether it holds JSON text or an object from an expression (for example `{{ $json.parameters }}`). Previously the text was passed to Ivanti unparsed. An empty field means no parameters, and invalid JSON or a value that is not a JSON object stops with a clear error naming the field

## [1.4.2] - 2026-10-09

### Fixed
- Fixed the error "Cannot use 'in' operator to search for 'description' in undefined". It happened when Ivanti's reply had no message for the node to show:
  - **Relationship → Link** and **Unlink** treated any reply without the `ISM_2000` status code as a failure, so a successful call that returned an empty body (for example HTTP 204) crashed. A successful reply with no body now outputs `{ "success": true }`, and only a reply carrying a different Ivanti status code is reported as an error
  - **Service Request → Create** and **Create (Simplified)** now show "Ivanti could not create the service request and did not return a reason" when Ivanti rejects the request without a message
  - The node's error handler now turns any unexpected thrown value into readable text instead of crashing on it

## [1.4.1] - 2026-10-07

### Changed
- The business object field now accepts expressions in these operations, so the object can be set from the incoming data (for example `{{ $json.objectName }}`) instead of being fixed when the workflow is built:
  - **Business Object** → Get Many, Update and Delete ("Business Object")
  - **Relationship** → Get Related and Link ("Business Object")
  - **Search** → Full Text Search in Single Object ("Business Object")
  - **Attachment** → Upload ("Object Type")

## [1.4.0] - 2026-10-06

### Added
- Every operation except those in the **Automation** resource has a new **Options** section with **Override Headers**. Headers added there are sent with every request the operation makes and replace any default header of the same name. Header names are validated, and each input item can set its own headers through expressions
- If **Override Headers** includes an `Authorization` header, that header is sent as-is and the API key from the credential is not used. The credential still supplies the tenant URL and the SSL setting

## [1.3.1] - 2026-10-01

### Fixed
- Addressed n8n community package review findings:
  - The **Polling Trigger** and **Connector Trigger** no longer set `usableAsTool`, because trigger nodes cannot be invoked as AI tools
  - Node inputs and outputs use `NodeConnectionTypes.Main` from `n8n-workflow` instead of the string literal `'main'`
  - Errors caught in every operation and in the Connector Trigger webhook are now thrown as `NodeApiError` instead of being re-thrown raw. Existing `NodeApiError`s pass through unchanged, and validation messages are kept

## [1.3.0] - 2026-09-30

### Added
- **Business Object → Get Many** and the **Polling Trigger** have a new "Define Filter as JSON" toggle. When it is on, a "Raw Filter (JSON)" field replaces the filter builder and takes the conditions as a JSON array (or a single object), which makes it possible to build filters from expressions. Each condition is checked against the same allowed operations, field types and logical operators as the filter builder

## [1.2.12] - 2026-08-14

### Fixed
- The **Search → Saved Search** operation now validates the "Saved Search Name" parameter through a shared `validateSavedSearchName` helper: the value is trimmed, required, rejected if it contains spaces (Ivanti addresses saved searches by a path segment in which spaces are written as underscores, e.g. "My Active" becomes "My_Active"), and checked against the safe path-segment character set. Single-word names such as "Active" remain valid
- The "Saved Search Name" field now carries a `My_Active` placeholder and explains the underscore convention in its description, so the naming rule is visible before the workflow runs

## [1.2.11] - 2026-06-22

### Fixed
- Search operation dropdown values now match the camelCase module export names (`fullTextSearchAcrossAllObjects`, `fullTextSearchInSingleObject`, `savedSearch`). Previously the lowercase values caused all three Search operations to fail at runtime with a `TypeError` and left their input fields hidden in the UI
- The `node` field in each codex file (`*.node.json`) now uses the scoped npm package name `@synergyconsulting/n8n-nodes-ivanti-neurons-for-itsm` instead of the bare `n8n-nodes-ivanti-neurons-for-itsm` prefix
- Documented the intent of the fallback `catch` blocks in `listSearch.ts` and `transports/index.ts` with inline comments, clarifying why a parse/lookup failure returns a safe fallback value instead of throwing

## [1.2.0] - 2026-06-19

### Changed
- Consolidated the standalone **Ivanti Neurons for ITSM Connector** action node into the main **Ivanti Neurons for ITSM** node as a new **Automation** resource, so the package registers a single action node (plus its trigger nodes) as required for n8n Cloud eligibility
- The **Automation** resource now authenticates with the same API-key credential (`ivantiNeuronsForItsmApiKeyApi`) as the rest of the node

### Removed
- The separate `IvantiNeuronsForItsmConnector` action node (its single "Update Automation Transaction" operation now lives under the Automation resource of the main node). The `IvantiNeuronsForItsmConnectorTrigger` node is unchanged.

## [1.1.0] - 2026-06-15

### Added
- Security warning for the "Skip SSL Verification" option in credentials to inform users of the risk
- Constant-time string comparison for authorization header validation to prevent timing attacks
- `buildBaseUrl` / `normalizeTenant` utilities for centralised URL construction in `ivantiApiRequest` and `ivantiApiRequestFormData`
- `toActualObjectType` helper to convert plural object names to their singular API counterparts, used in `uploadAttachment` and `run` operations
- `parseBoolean` helper for strict boolean parsing, used in `getMany` and the trigger node
- Validation for Ivanti transaction GUIDs with improved error messages in automation operations
- Safety checks for record IDs, field names, and URL path segments across all operations
- Shared OData query properties and utility functions to reduce duplication across operations

### Fixed
- Attachment operation descriptions now clarify limitations when used as AI-agent tools
- Node display name updated for clarity in the Ivanti Neurons for ITSM trigger
- Removed unnecessary node properties; updated build scripts for correct output
- Code formatting and readability improvements in the `readAttachment` operation and `tsconfig`
- Header authorization validation hardened and error handling improved in the trigger node
- Authentication modes description and header parameter labels clarified in credentials
- Default values and `required`/`noDataExpression` flags corrected across node properties
- `getMany` data-fetching logic refactored for clarity and reusability
- Authentication mode documentation and credential references updated
- Service request parameter descriptions improved for clarity and usability
- API endpoint descriptions and HTTP methods corrected in documentation
- Renamed `businessObject` parameter to `object` for consistency in `delete` and `get` operations
- Business object descriptions and input validation unified across all operations
- Business object validation integrated into trigger and quick-action operations
- Operation options reordered and standardised for attachment and search actions
- Router function now returns a proper error for unimplemented resources instead of silently failing
- Field type handling updated to use `ResourceMapperField` in schema utility functions
- Search action operation names and imports standardised
- Trigger node subtitle and `updates` parameter type corrected
- `Record ID` parameter is now validated as non-empty before executing operations
- Per-item parameter validation added across multiple operations
- Operations now respect the "Continue on Failure" setting and handle errors gracefully
- `noDataExpression` set to `false` for properties in `create`, `getByRecId`, `searchByKeyword`, and `run` operations
- `ivantiApiRequest` error handling improved with detailed error message construction
- Unused imports removed from trigger and operation files
- `ivantiApiRequest` now sets a sensible default for the `body` parameter

### Changed
- Node and connector documentation and description updated for the Ivanti Neurons for ITSM Connector
