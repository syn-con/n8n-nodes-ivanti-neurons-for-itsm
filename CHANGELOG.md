# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
