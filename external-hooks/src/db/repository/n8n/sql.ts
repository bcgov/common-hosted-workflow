import type { EntityMetadataLike } from '../../../api/types/n8n-adapters';

export function getColumnName(metadata: EntityMetadataLike, propertyName: string) {
  const column = metadata.columns.find((item) => item.propertyName === propertyName);
  if (!column) {
    throw new Error(`Missing column ${propertyName} on ${metadata.tableName}`);
  }
  return column.databaseName;
}

export function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
