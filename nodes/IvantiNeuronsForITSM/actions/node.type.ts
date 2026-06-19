import type { AllEntities } from 'n8n-workflow';

/**
 * Maps every resource name to the set of operation names it supports.
 * Used with `AllEntities` to produce a discriminated union type that lets
 * TypeScript narrow `resource` and `operation` together in the router.
 */
type NodeMap = {
	search: 'fullTextSearchInSingleObject' | 'fullTextSearchAcrossAllObjects' | 'savedSearch';
	businessobject: 'getMany' | 'getByRecId' | 'searchByKeyword' | 'create' | 'update' | 'deleteByRecId';
	attachment: 'read' | 'upload' | 'deleteOp';
	relationship: 'getRelated' | 'link' | 'unlink';
	serviceReq: 'getSubscription' | 'getServiceReqParams' | 'create' | 'createSimplified';
	quickAction: 'run';
	automation: 'update';
};

/**
 * Discriminated-union type for the `IvantiNeuronsForItsm` node.
 * Each member of the union pairs a specific `resource` value with the
 * operations that are valid for that resource, enabling type-safe dispatch
 * in the router's `switch` statement.
 */
export type Ivanti = AllEntities<NodeMap>;
