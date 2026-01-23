module.exports = {
  n8n: {
    /**
     * Called when n8n is ready
     * We use this to register custom routes for OIDC
     */
    ready: [
      async function (server, n8nConfig) {
        // const { Execution } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/db/src/entities');

        const { Container } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/di');
        const { DataSource } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/typeorm');
        const {
          ExecutionEntity,
        } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/db/dist/entities/execution-entity');

        const dataSource = Container.get(DataSource);

        // Pass the Class, not a string
        const executionRepository = dataSource.getRepository(ExecutionEntity);

        const latestExecutions = await executionRepository.find({
          take: 5,
          order: { id: 'DESC' }, // Usually helpful to get the actual newest ones
        });

        console.log(latestExecutions);
      },
    ],
  },
};

// n8n/packages/cli/src/services/jwt.service.ts
// JwtService
