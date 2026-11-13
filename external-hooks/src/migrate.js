"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const migrator_1 = require("drizzle-orm/node-postgres/migrator");
const node_postgres_1 = require("drizzle-orm/node-postgres");
const path_1 = __importDefault(require("path"));
const _config_1 = require("@config");
async function main() {
    if (!_config_1.CUSTOM_DATABASE_URL) {
        throw new Error('CUSTOM_DATABASE_URL is not set');
    }
    const db = (0, node_postgres_1.drizzle)(_config_1.CUSTOM_DATABASE_URL);
    await (0, migrator_1.migrate)(db, { migrationsFolder: path_1.default.join(__dirname, 'drizzle') });
    console.log('Migrations completed!');
}
main();
