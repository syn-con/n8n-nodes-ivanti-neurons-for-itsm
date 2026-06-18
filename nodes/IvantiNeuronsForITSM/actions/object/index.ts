import type { INodeProperties } from 'n8n-workflow';

import * as getMany from './getMany.operation';
import * as getByRecId from './getByRecId.operation';
import * as searchByKeyword from './searchByKeyword.operation';
import * as create from './create.operation';
import * as update from './update.operation';
import * as deleteByRecId from './deleteByRecId.operation';

/** Re-export all Business Object operation modules for use by the router. */
export { getMany, getByRecId, searchByKeyword, create, update, deleteByRecId };

export const description: INodeProperties[] = [
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        placeholder: 'Select an operation',
        options: [
            {
                name: 'Create',
                value: 'create',
                description: 'Create a record in a specified business object',
                action: 'Create a record in a specified business object',
            },
            {
                name: 'Delete By Record ID',
                value: 'deleteByRecId',
                description: 'Delete a record in a specified business object by its ID',
                action: 'Delete a record in a specified business object by its ID',
            },
            {
                name: 'Get By Record ID',
                value: 'getByRecId',
                description: 'Retrieves a single record from a specified business object by its ID',
                action: 'Get a record from a business object by its ID',
            },
            {
                name: 'Get Many',
                value: 'getMany',
                description: 'Retrieves many records from a specified business object',
                action: 'Get many records from a business object',
            },
            {
                name: 'Search By Keyword',
                value: 'searchByKeyword',
                description: 'Searches for records in a specified business object by a keyword',
                action: 'Search for records in a business object by a keyword',
            },
            {
                name: 'Update',
                value: 'update',
                description: 'Update a record in a specified business object',
                action: 'Update a record in a specified business object',
            },
        ],
        default: 'getMany',
        displayOptions: {
            show: {
                resource: ['businessobject'],
            }
        }
    },

    ...getMany.description,
    ...getByRecId.description,
    ...searchByKeyword.description,
    ...create.description,
    ...update.description,
    ...deleteByRecId.description,
];
