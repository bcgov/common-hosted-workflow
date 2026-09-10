import type { IDataObject } from 'n8n-workflow';
import { graphPagedRequest, type GraphContext, type RetryOptions } from '../../transport/graphRequest';
import { findColumnEntry } from '../../transport/coerce';
import type { ColumnMap } from '../../transport/resolve';

export type FilterOperator = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'startswith' | 'contains';

export interface SimpleFilterCondition {
  /** Display name or internal name — resolved via the column map when possible. */
  column: string;
  operator: FilterOperator;
  value: string;
}

const FUNCTION_OPERATORS = new Set<FilterOperator>(['startswith', 'contains']);

/**
 * Compile Simple-mode filter conditions into an OData $filter string
 * (spec section 7.2), AND-composed. A column key not found on the map is
 * treated as an already-internal name rather than rejected — this lets
 * power users target a system column the writable map excludes.
 */
export function compileSimpleFilter(columnMap: ColumnMap, conditions: SimpleFilterCondition[]): string {
  return conditions
    .map((condition) => {
      const internalName = findColumnEntry(columnMap, condition.column)?.internalName ?? condition.column;
      const escapedValue = condition.value.replace(/'/g, "''");
      if (FUNCTION_OPERATORS.has(condition.operator)) {
        return `${condition.operator}(fields/${internalName}, '${escapedValue}')`;
      }
      return `fields/${internalName} ${condition.operator} '${escapedValue}'`;
    })
    .join(' and ');
}

export interface GetManyOptions {
  filterMode: 'none' | 'simple' | 'odata';
  simpleConditions?: SimpleFilterCondition[];
  odataFilter?: string;
  returnAll: boolean;
  limit?: number;
}

/**
 * Get many SharePoint list items with fields expanded (spec section 7.2).
 * Always sends the non-indexed-query Prefer header since arbitrary filter
 * targets are rarely indexed (spec section 3).
 */
export async function getManyItems(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  listId: string,
  columnMap: ColumnMap,
  options: GetManyOptions,
): Promise<IDataObject[]> {
  const qs: IDataObject = { $expand: 'fields' };
  if (options.filterMode === 'simple' && options.simpleConditions?.length) {
    qs.$filter = compileSimpleFilter(columnMap, options.simpleConditions);
  } else if (options.filterMode === 'odata' && options.odataFilter) {
    qs.$filter = options.odataFilter;
  }

  return graphPagedRequest<IDataObject>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/lists/${listId}/items`,
      qs,
      headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
      json: true,
    },
    retry,
    { returnAll: options.returnAll, limit: options.limit },
  );
}
