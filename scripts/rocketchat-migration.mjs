import fs from 'fs';
import axios from 'axios';
import pino from 'pino';
import * as csv from 'fast-csv';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      colorizeObjects: true,
      ignore: 'pid,hostname',
    },
  },
});

const CONFIG = {
  N8N_BASE_URL: process.env.N8N_BASE_URL || 'http://localhost:5678',
  API_KEY: process.env.N8N_API_KEY || '',
  INPUT_FILE: 'rocketchat-migration-sample.csv',
  OUTPUT_FILE: 'rocketchat-migration-output.csv',
  CONCURRENCY_LIMIT: 5,
};

const CSV_COLUMNS = {
  LEGACY_URL: 'URL',
  WEBHOOK_NAME: 'WebHook Name',
  USER_EMAIL: 'Owner Email',
  SOURCE_TYPE: 'Payload Type',
  TEAMS_TEAM_ID: 'Team ID',
  TEAMS_CHANNEL_ID: 'Channel ID',
};

const SOURCES = {
  Backup: 'template,backup-container',
  Github: 'template,github',
  'Rocket.Chat': 'template,rocket-chat',
  StatusCake: 'template,status-cake',
  Sysdig: 'template,sysdig',
  UptimeCom: 'template,uptime-com',
  Other: 'text',
};

const api = axios.create({
  baseURL: CONFIG.N8N_BASE_URL,
  headers: {
    'X-N8N-API-KEY': CONFIG.API_KEY,
    'Content-Type': 'application/json',
  },
});

function generateTeamsLink(channelId, groupId, tenantId, title = 'title') {
  const baseUrl = 'https://teams.microsoft.com';

  const path = `/l/channel/${encodeURIComponent(channelId)}/${encodeURIComponent(title)}`;

  const url = new URL(path, baseUrl);

  if (groupId) url.searchParams.append('groupId', groupId);
  if (tenantId) url.searchParams.append('tenantId', tenantId);

  return url.toString();
}

/**
 * Step 1: Ensures user exists and retrieves their auto-provisioned project
 */
async function ensureUserAndGetProject(email) {
  try {
    const { data } = await api.get(`/rest/custom/admin/users/${email}/project`);
    return data;
  } catch (error) {
    if (error.response?.status === 404) {
      logger.info(`🙍🏻‍♂️ [${email}] Creating user`);
      await api
        .post('/api/v1/users', [{ email, role: 'global:member' }])
        .catch((err) => logger.error(`💥 [${email}] Error creating user; ${err.response.data.message}`));

      // Short delay for n8n background project provisioning
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const retry = await api.get(`/rest/custom/admin/users/${email}/project`);
      return retry.data;
    }

    throw new Error(`User lookup failed: ${error.message}`);
  }
}

/**
 * Step 2: Creates the workflow and moves it to the specific project
 */
async function createAndLinkWorkflow(name, projectId, sourceType, sourceSubtype = '', channelLink, payload) {
  const webhookId = getUniversalUUID();

  const { data: credential } = await api.post('/api/v1/credentials', {
    name: `DevX Connector - ${name}`,
    type: 'devXConnector',
    data: { channelLink },
    isGlobal: false,
    isResolvable: false,
    projectId,
  });

  await api.post('/rest/custom/admin/associate-credential', {
    credentialId: credential.id,
    projectId,
    singleOwner: true,
  });

  const { data: workflow } = await api.post('/api/v1/workflows', {
    name,
    nodes: [
      {
        webhookId,
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2.1,
        position: [0, 0],
        parameters: {
          path: webhookId,
          httpMethod: 'POST',
          options: {},
        },
      },
      {
        name: 'DevX Message Connector',
        type: 'CUSTOM.devXMessageConnector',
        typeVersion: 0.1,
        position: [208, 0],
        parameters: {
          type: sourceType,
          source: sourceSubtype,
          payload,
        },
        credentials: {
          devXConnector: {
            id: credential.id,
            name: credential.name,
          },
        },
      },
    ],
    connections: {
      Webhook: {
        main: [
          [
            {
              node: 'DevX Message Connector',
              type: 'main',
              index: 0,
            },
          ],
        ],
      },
    },
    settings: {},
    staticData: {},
  });

  // Associate it with the project (Transfer ownership)
  await api.post('/rest/custom/admin/associate-workflow', {
    workflowId: workflow.id,
    projectId,
    singleOwner: true,
  });

  return workflow;
}

async function processMigrationRow(row) {
  const email = row[CSV_COLUMNS.USER_EMAIL];
  const webhookName = row[CSV_COLUMNS.WEBHOOK_NAME];
  const source = row[CSV_COLUMNS.SOURCE_TYPE];
  const teamId = row[CSV_COLUMNS.TEAMS_TEAM_ID];
  const channelId = row[CSV_COLUMNS.TEAMS_CHANNEL_ID];

  try {
    const userProject = await ensureUserAndGetProject(email);
    const projectId = userProject?.project?.id;

    if (!projectId) throw new Error('Could not resolve Project ID');

    const channelLink = generateTeamsLink(channelId, teamId, null, webhookName);
    const messageTypes = SOURCES[source] || SOURCES['Other'];
    const [sourceType, sourceSubtype] = messageTypes.split(',');
    const payload =
      source === 'Other' ? `${webhookName} has triggered, please configure workflow output` : '={{ $json.body }}';

    const workflow = await createAndLinkWorkflow(
      webhookName,
      projectId,
      sourceType,
      sourceSubtype,
      channelLink,
      payload,
    );

    const webhookNode = workflow.nodes.find((node) => node.name);

    logger.info(`✅ [${email}] Migrated: ${webhookName}`);
    return { ...row, 'Workflow ID': workflow.id, 'Webhook ID': webhookNode.webhookId, Status: 'Success' };
  } catch (err) {
    logger.error(`❌ [${email}] Failed: ${err.message}`);
    return { ...row, 'Workflow ID': '', 'Webhook ID': '', Status: 'Failed', error: err.message };
  }
}

async function migrate() {
  const inputRows = [];
  const outputData = [];

  logger.info('📖 Reading input file...');
  const stream = fs.createReadStream(CONFIG.INPUT_FILE).pipe(csv.parse({ headers: true }));
  for await (const row of stream) {
    inputRows.push(row);
  }

  logger.info(`🚀 Processing ${inputRows.length} entries (Concurrency: ${CONFIG.CONCURRENCY_LIMIT})...`);

  for (let i = 0; i < inputRows.length; i += CONFIG.CONCURRENCY_LIMIT) {
    const chunk = inputRows.slice(i, i + CONFIG.CONCURRENCY_LIMIT);
    const results = await Promise.all(chunk.map((row) => processMigrationRow(row)));
    outputData.push(...results);
    logger.info(`⏳ Progress: ${Math.min(i + CONFIG.CONCURRENCY_LIMIT, inputRows.length)}/${inputRows.length}`);
  }

  csv
    .writeToPath(CONFIG.OUTPUT_FILE, outputData, { headers: true })
    .on('finish', () => logger.info(`✨ Done! Saved to ${CONFIG.OUTPUT_FILE}`));
}

migrate().catch((err) => logger.error(err));

function getUniversalUUID() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback for insecure browser contexts (HTTP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
