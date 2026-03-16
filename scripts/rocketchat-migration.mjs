import fs from 'fs';
import axios from 'axios';
import * as csv from 'fast-csv';

const CONFIG = {
  N8N_BASE_URL: process.env.N8N_BASE_URL || 'http://localhost:5678',
  API_KEY: process.env.N8N_API_KEY || '',
  INPUT_FILE: 'rocketchat-migration-sample.csv',
  OUTPUT_FILE: 'rocketchat-migration-output.csv',
  CONCURRENCY_LIMIT: 5,
};

const CSV_COLUMNS = {
  LEGACY_URL: 'Rocket.Chat Webhook URL',
  WEBHOOK_NAME: 'The Webhook name',
  USER_EMAIL: 'The valid IDIR user email',
  SOURCE_TYPE: 'The source type',
  TEAMS_CHANNEL_ID: 'The target Teams channel ID',
};

const api = axios.create({
  baseURL: CONFIG.N8N_BASE_URL,
  headers: {
    'X-N8N-API-KEY': CONFIG.API_KEY,
    'Content-Type': 'application/json',
  },
});

/**
 * Step 1: Ensures user exists and retrieves their auto-provisioned project
 */
const ensureUserAndGetProject = async (email) => {
  try {
    const { data } = await api.get(`/rest/custom/admin/users/${email}/project`);
    return data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`👤 Creating user: ${email}`);
      await api.post('/api/v1/users', { email, role: 'global:member' });
      // Short delay for n8n background project provisioning
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const retry = await api.get(`/rest/custom/admin/users/${email}/project`);
      return retry.data;
    }
    throw new Error(`User lookup failed: ${error.message}`);
  }
};

/**
 * Step 2: Creates the workflow and moves it to the specific project
 */
const createAndLinkWorkflow = async (name, projectId) => {
  const { data: workflow } = await api.post('/api/v1/workflows', {
    name,
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          options: {},
        },
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2.1,
        position: [0, 0],
        name: 'Webhook',
      },
      // TODO: Later pipe this to the second node—a custom n8n node for transforming RocketChat messages.
    ],
    connections: {},
    settings: {},
    staticData: {},
  });

  // Associate it with the project (Transfer ownership)
  await api.post('/rest/custom/admin/associate-workflow', {
    workflowId: workflow.id,
    projectId: projectId,
    singleOwner: true,
  });

  return workflow;
};

const processMigrationRow = async (row) => {
  const email = row[CSV_COLUMNS.USER_EMAIL];
  const webhookName = row[CSV_COLUMNS.WEBHOOK_NAME];

  try {
    const userProject = await ensureUserAndGetProject(email);
    const projectId = userProject?.project?.id;

    if (!projectId) throw new Error('Could not resolve Project ID');

    const workflow = await createAndLinkWorkflow(webhookName, projectId);

    console.log(`✅ Migrated: ${webhookName} -> ${email}`);
    return { ...row, 'Workflow ID': workflow.id, Status: 'Success' };
  } catch (err) {
    console.error(`❌ Failed [${webhookName}]: ${err.message}`);
    return { ...row, 'Workflow ID': '', Status: 'Failed', error: err.message };
  }
};

const migrate = async () => {
  const inputRows = [];
  const outputData = [];

  console.log('📖 Reading input file...');
  const stream = fs.createReadStream(CONFIG.INPUT_FILE).pipe(csv.parse({ headers: true }));
  for await (const row of stream) {
    inputRows.push(row);
  }

  console.log(`🚀 Processing ${inputRows.length} entries (Concurrency: ${CONFIG.CONCURRENCY_LIMIT})...`);

  for (let i = 0; i < inputRows.length; i += CONFIG.CONCURRENCY_LIMIT) {
    const chunk = inputRows.slice(i, i + CONFIG.CONCURRENCY_LIMIT);
    const results = await Promise.all(chunk.map((row) => processMigrationRow(row)));
    outputData.push(...results);
    console.log(`⏳ Progress: ${Math.min(i + CONFIG.CONCURRENCY_LIMIT, inputRows.length)}/${inputRows.length}`);
  }

  csv
    .writeToPath(CONFIG.OUTPUT_FILE, outputData, { headers: true })
    .on('finish', () => console.log(`✨ Done! Saved to ${CONFIG.OUTPUT_FILE}`));
};

migrate().catch(console.error);
