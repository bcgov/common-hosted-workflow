import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectRelationRepository } from '../../../../src/db/repository/n8n/project-relation';

const metadata = {
  ProjectRelation: {
    tableName: 'project_relation',
    columns: [
      { propertyName: 'projectId', databaseName: 'projectId' },
      { propertyName: 'userId', databaseName: 'userId' },
      { propertyName: 'role', databaseName: 'role' },
    ],
  },
  User: {
    tableName: 'user',
    columns: [
      { propertyName: 'id', databaseName: 'id' },
      { propertyName: 'email', databaseName: 'email' },
      { propertyName: 'disabled', databaseName: 'disabled' },
    ],
  },
} as const;

function makeRawRepo() {
  return {
    metadata: metadata.ProjectRelation,
    manager: { query: vi.fn().mockResolvedValue([]) },
    findAllByUser: vi.fn(),
    findProjectRole: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

describe('ProjectRelationRepository.listMemberEmailsByProjectIdsAndRoles', () => {
  let raw: ReturnType<typeof makeRawRepo>;
  let repo: ProjectRelationRepository;

  beforeEach(() => {
    raw = makeRawRepo();
    repo = new ProjectRelationRepository(raw as any, metadata.User as any);
  });

  it('returns an empty Map without querying for empty project or role input', async () => {
    expect(await repo.listMemberEmailsByProjectIdsAndRoles([], ['project:admin'])).toEqual(new Map());
    expect(await repo.listMemberEmailsByProjectIdsAndRoles(['proj-1'], [])).toEqual(new Map());
    expect(raw.manager.query).not.toHaveBeenCalled();
  });

  it('filters by role slug and disabled users, grouping emails per project', async () => {
    raw.manager.query.mockResolvedValue([
      { projectId: 'proj-1', email: 'editor@test.com' },
      { projectId: 'proj-1', email: 'admin@test.com' },
      { projectId: 'proj-2', email: 'owner@test.com' },
    ]);

    const result = await repo.listMemberEmailsByProjectIdsAndRoles(
      ['proj-1', 'proj-2'],
      ['project:admin', 'project:editor', 'project:personalOwner'],
    );

    const [sql, params] = raw.manager.query.mock.calls[0];
    // The relation's `role` column stores the slug directly and disabled
    // users / missing emails are excluded.
    expect(sql).toContain('"role" = ANY($2)');
    expect(sql).toContain('"disabled" = false');
    expect(sql).toContain('IS NOT NULL');
    expect(params[0]).toEqual(['proj-1', 'proj-2']);
    expect(params[1]).toEqual(['project:admin', 'project:editor', 'project:personalOwner']);
    expect(result.get('proj-1')).toEqual(['editor@test.com', 'admin@test.com']);
    expect(result.get('proj-2')).toEqual(['owner@test.com']);
  });

  it('reports projects without matching relations as absent from the map', async () => {
    raw.manager.query.mockResolvedValue([]);

    const result = await repo.listMemberEmailsByProjectIdsAndRoles(['proj-1'], ['project:admin']);

    expect(result.size).toBe(0);
  });
});
