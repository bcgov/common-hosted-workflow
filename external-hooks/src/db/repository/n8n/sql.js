"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getColumnName = getColumnName;
exports.quoteIdentifier = quoteIdentifier;
function getColumnName(metadata, propertyName) {
    const column = metadata.columns.find((item) => item.propertyName === propertyName);
    if (!column) {
        throw new Error(`Missing column ${propertyName} on ${metadata.tableName}`);
    }
    return column.databaseName;
}
function quoteIdentifier(identifier) {
    return `"${identifier.replaceAll('"', '""')}"`;
}
