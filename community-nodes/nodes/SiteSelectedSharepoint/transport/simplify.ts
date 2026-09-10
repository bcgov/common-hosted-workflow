import type { IDataObject } from 'n8n-workflow';
import type { ColumnMap } from './resolve';

/**
 * Flatten a raw Graph list-item response into a simplified shape:
 * - Promotes `fields` to the root level
 * - Re-keys internal names → display names using the column map
 * - Preserves the item `id`
 *
 * Unknown internal names (not in the writable column map — e.g. system
 * fields like `@odata.etag`) pass through with their original key.
 *
 * This implements spec section 7.2's "Simplify" output toggle so
 * downstream expressions read `$json["COORS #"]` rather than
 * `$json.fields.OData__x0043_oors__x0023_`.
 */
export function simplifyItem(item: IDataObject, columnMap: ColumnMap): IDataObject {
  const fields = (item.fields ?? {}) as IDataObject;
  const simplified: IDataObject = { id: item.id };

  for (const [internalKey, value] of Object.entries(fields)) {
    const entry = columnMap.byInternalName.get(internalKey);
    const outputKey = entry ? entry.displayName : internalKey;
    simplified[outputKey] = value;
  }

  return simplified;
}

/** Simplify an array of raw Graph list-item responses. */
export function simplifyItems(items: IDataObject[], columnMap: ColumnMap): IDataObject[] {
  return items.map((item) => simplifyItem(item, columnMap));
}
