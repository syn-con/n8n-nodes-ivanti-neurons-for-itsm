import type { INodeProperties } from 'n8n-workflow';
import * as fullTextSearchInSingleObject from './fullTextSearchInSingleObject.operation';
import * as fullTextSearchAcrossAllObjects from './fullTextSearchAcrossAllObjects.operation';
import * as savedSearch from './savedSearch.operation';


export { fullTextSearchInSingleObject, fullTextSearchAcrossAllObjects, savedSearch };


export const description: INodeProperties[] = [
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        placeholder: 'Select an operation',
        options: [
            {
                name: 'Full Text Search Across All Objects',
                value: 'fulltextsearchacrossallobjects',
                description: 'Searches all business objects for the provided text',
                action: 'Perform a full text search across all objects',
            },
            {
                name: 'Full Text Search in Single Object',
                value: 'fulltextsearchinsingleobject',
                description: 'Searches a specific business object for the provided text',
                action: 'Perform a full text search in a single object',
            },
            //saved search
            {
                name: 'Saved Search',
                value: 'savedsearch',
                description: 'Searches for a saved search by name and GUID',
                action: 'Perform a saved search',
            },
        ],
        default: 'fulltextsearchacrossallobjects',
        displayOptions: {
            show: {
                resource: ['search'],
            }
        }
    },
    ...fullTextSearchInSingleObject.description,
    ...fullTextSearchAcrossAllObjects.description,
    ...savedSearch.description,
];