'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const project_relation_1 = require('../../../../src/db/repository/n8n/project-relation');
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
};
function makeRawRepo() {
  return {
    metadata: metadata.ProjectRelation,
    manager: { query: vitest_1.vi.fn().mockResolvedValue([]) },
    findAllByUser: vitest_1.vi.fn(),
    findProjectRole: vitest_1.vi.fn(),
    save: vitest_1.vi.fn(),
    delete: vitest_1.vi.fn(),
  };
}
(0, vitest_1.describe)('ProjectRelationRepository.listMemberEmailsByProjectIdsAndRoles', () => {
  let raw;
  let repo;
  (0, vitest_1.beforeEach)(() => {
    raw = makeRawRepo();
    repo = new project_relation_1.ProjectRelationRepository(raw, metadata.User);
  });
  (0, vitest_1.it)('returns an empty Map without querying for empty project or role input', async () => {
    (0, vitest_1.expect)(await repo.listMemberEmailsByProjectIdsAndRoles([], ['project:admin'])).toEqual(new Map());
    (0, vitest_1.expect)(await repo.listMemberEmailsByProjectIdsAndRoles(['proj-1'], [])).toEqual(new Map());
    (0, vitest_1.expect)(raw.manager.query).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('filters by role slug and disabled users, grouping emails per project', async () => {
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
    (0, vitest_1.expect)(sql).toContain('"role" = ANY($2)');
    (0, vitest_1.expect)(sql).toContain('"disabled" = false');
    (0, vitest_1.expect)(sql).toContain('IS NOT NULL');
    (0, vitest_1.expect)(params[0]).toEqual(['proj-1', 'proj-2']);
    (0, vitest_1.expect)(params[1]).toEqual(['project:admin', 'project:editor', 'project:personalOwner']);
    (0, vitest_1.expect)(result.get('proj-1')).toEqual(['editor@test.com', 'admin@test.com']);
    (0, vitest_1.expect)(result.get('proj-2')).toEqual(['owner@test.com']);
  });
  (0, vitest_1.it)('reports projects without matching relations as absent from the map', async () => {
    raw.manager.query.mockResolvedValue([]);
    const result = await repo.listMemberEmailsByProjectIdsAndRoles(['proj-1'], ['project:admin']);
    (0, vitest_1.expect)(result.size).toBe(0);
  });
});
