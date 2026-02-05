const hookConfig = {
  n8n: {
    ready: [
      async function (server: any, n8nConfig: any) {
        const { Container } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/di');
        const { DataSource } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/typeorm');
        const {
          ExecutionEntity,
        } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/db/dist/entities/execution-entity');

        const dataSource = Container.get(DataSource);
        const executionRepository = dataSource.getRepository(ExecutionEntity);

        const latestExecutions = await executionRepository.find({
          take: 5,
          order: { id: 'DESC' },
        });

        console.log(latestExecutions);
      },
    ],
  },
};

export = hookConfig;
