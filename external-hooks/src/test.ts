import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { userWorkflow } from './db/schema';
import path from 'path';

const hookConfig = {
  n8n: {
    ready: [
      async function (server: any, n8nConfig: any) {
        // const { Container } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/di');
        // const { DataSource } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/typeorm');
        // const {
        //   ExecutionEntity,
        // } = require('/usr/local/lib/node_modules/n8n/node_modules/@n8n/db/dist/entities/execution-entity');

        // const dataSource = Container.get(DataSource);
        // const executionRepository = dataSource.getRepository(ExecutionEntity);

        // const latestExecutions = await executionRepository.find({
        //   take: 5,
        //   order: { id: 'DESC' },
        // });
        // console.log(latestExecutions);

        const db = drizzle(process.env.CUSTOM_DATABASE_URL);
        await migrate(db, { migrationsFolder: path.join(__dirname, 'drizzle') });
        console.log('Migrations completed!');

        const result = await db.execute('select 1');
        console.log(result);

        const allWorkflows = await db.select().from(userWorkflow);
        console.log(allWorkflows);
      },
    ],
  },
};

export = hookConfig;
