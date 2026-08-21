import type { IDataObject } from 'n8n-workflow';
import {
  graphPagedRequest,
  type GraphContext,
  type RetryOptions,
  type PagingOptions,
} from '../../transport/graphRequest';
import { resolveListId } from '../../transport/resolve';

const USER_INFO_LIST_NAME = 'User Information List';

export interface GetManyUsersOptions extends PagingOptions {
  excludeSystemAccounts: boolean;
}

interface UserItem {
  id: string;
  fields: { EMail?: string; UserName?: string; Title?: string; ContentType?: string };
}

/**
 * Fetch users from the hidden User Information List (spec section 7.4).
 * When `excludeSystemAccounts` is true, system/group principals (ContentType
 * !== 'Person') are filtered out client-side — the User Information List has
 * no indexed ContentType column so Graph $filter is unreliable here.
 */
export async function getManyUsers(
  context: GraphContext,
  baseUrl: string,
  retry: RetryOptions,
  siteId: string,
  options: GetManyUsersOptions,
): Promise<IDataObject[]> {
  const userListId = await resolveListId(
    context,
    baseUrl,
    retry,
    siteId,
    { mode: 'name', value: USER_INFO_LIST_NAME },
    { includeHiddenLists: 'true' },
  );

  // When filtering by ContentType, we must fetch all items to filter client-side,
  // then apply the limit afterwards. When not filtering, let graphPagedRequest
  // handle pagination limits directly.
  const pagingOptions: PagingOptions = options.excludeSystemAccounts
    ? { returnAll: true }
    : { returnAll: options.returnAll, limit: options.limit };

  const items = await graphPagedRequest<UserItem>(
    context,
    {
      method: 'GET',
      url: `${baseUrl}/sites/${siteId}/lists/${userListId}/items`,
      qs: { $expand: 'fields($select=EMail,UserName,Title,Id,ContentType)', $top: 999 },
      json: true,
    },
    retry,
    pagingOptions,
  );

  let users = items;
  if (options.excludeSystemAccounts) {
    users = items.filter((u) => u.fields.ContentType === 'Person');
  }

  const results: IDataObject[] = users.map((u) => ({
    id: Number(u.id),
    email: u.fields.EMail ?? '',
    userName: u.fields.UserName ?? '',
    displayName: u.fields.Title ?? '',
    contentType: u.fields.ContentType ?? '',
  }));

  if (!options.returnAll && options.limit !== undefined) {
    return results.slice(0, options.limit);
  }
  return results;
}
