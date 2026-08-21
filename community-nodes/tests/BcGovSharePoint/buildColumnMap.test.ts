import { describe, expect, it } from 'vitest';
import { buildColumnMap, ColumnAmbiguityError, type GraphColumn } from '../../nodes/BcGovSharePoint/transport/resolve';

function col(overrides: Partial<GraphColumn>): GraphColumn {
  return { name: 'Field1', displayName: 'Field 1', ...overrides };
}

describe('buildColumnMap', () => {
  it('includes a plain writable text column', () => {
    const map = buildColumnMap([col({ name: 'Field1', displayName: 'Field 1', text: {} })]);
    expect(map.byDisplayName.get('field 1')?.internalName).toBe('Field1');
    expect(map.byInternalName.get('Field1')?.type).toBe('text');
  });

  it('drops columns in the system deny-list', () => {
    const map = buildColumnMap([col({ name: 'Created', displayName: 'Created', dateTime: {} })]);
    expect(map.byInternalName.has('Created')).toBe(false);
  });

  it('drops columns starting with the _Compliance prefix', () => {
    const map = buildColumnMap([col({ name: '_ComplianceTag', displayName: 'Compliance Tag', text: {} })]);
    expect(map.byInternalName.has('_ComplianceTag')).toBe(false);
  });

  it('drops columns marked readOnly', () => {
    const map = buildColumnMap([col({ name: 'ReadOnlyField', displayName: 'Read Only', text: {}, readOnly: true })]);
    expect(map.byInternalName.has('ReadOnlyField')).toBe(false);
  });

  it('remaps a renamed Title: LinkTitle carries the renamed display name onto Title', () => {
    const columns: GraphColumn[] = [
      { name: 'Title', displayName: 'Title', text: {} },
      { name: 'LinkTitle', displayName: 'Affected Party', readOnly: true, hyperlinkOrPicture: {} },
    ];
    const map = buildColumnMap(columns);
    expect(map.byDisplayName.get('affected party')?.internalName).toBe('Title');
  });

  it('throws ColumnAmbiguityError when two writable columns share a display name', () => {
    const columns: GraphColumn[] = [
      { name: 'FieldA', displayName: 'Dup', text: {} },
      { name: 'FieldB', displayName: 'Dup', text: {} },
    ];
    expect(() => buildColumnMap(columns)).toThrow(ColumnAmbiguityError);
  });

  it('classifies choice, person, and lookup types', () => {
    const columns: GraphColumn[] = [
      { name: 'Choice1', displayName: 'Choice 1', choice: { choices: ['A', 'B'] } },
      { name: 'Person1', displayName: 'Person 1', personOrGroup: {} },
      { name: 'Lookup1', displayName: 'Lookup 1', lookup: { listId: 'list-2', columnName: 'Title' } },
    ];
    const map = buildColumnMap(columns);
    expect(map.byInternalName.get('Choice1')?.type).toBe('choice');
    expect(map.byInternalName.get('Person1')?.type).toBe('personOrGroup');
    expect(map.byInternalName.get('Lookup1')?.type).toBe('lookup');
    expect(map.byInternalName.get('Lookup1')?.lookup).toEqual({ listId: 'list-2', column: 'Title' });
  });

  it('excludes calculated, contentApprovalStatus, and thumbnail columns as read-only by type', () => {
    const columns: GraphColumn[] = [
      { name: 'Calc1', displayName: 'Calc 1', calculated: {} },
      { name: 'Approval1', displayName: 'Approval 1', contentApprovalStatus: {} },
      { name: 'Thumb1', displayName: 'Thumb 1', thumbnail: {} },
    ];
    const map = buildColumnMap(columns);
    expect(map.byInternalName.size).toBe(0);
  });
});
