import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import path from 'path';

async function main() {
  const db = drizzle(process.env.CUSTOM_DATABASE_URL);
  await migrate(db, { migrationsFolder: path.join(__dirname, 'drizzle') });
  console.log('Migrations completed!');
}

main();
