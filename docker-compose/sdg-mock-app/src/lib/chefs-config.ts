import fs from 'fs';
import path from 'path';

export interface ChefsFormConfig {
  formId: string;
  formName: string;
  apiKey: string;
  allowedActors: string[];
  callbackWebhookUrl: string;
}

interface ChefsConfig {
  forms: ChefsFormConfig[];
}

const EMPTY_CONFIG: ChefsConfig = { forms: [] };

/**
 * Read chefs-config.json at runtime.
 *
 * Falls back to an empty config if the file doesn't exist (e.g. in CI),
 * so the build never breaks due to a missing config file.
 */
export function loadChefsConfig(): ChefsConfig {
  const candidates = [
    path.join(process.cwd(), 'src/app/api/chefs/chefs-config.json'),
    path.resolve(__dirname, '../app/api/chefs/chefs-config.json'),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as ChefsConfig;
      }
    } catch {
      // continue to next candidate
    }
  }

  console.warn('[chefs-config] chefs-config.json not found — using empty config');
  return EMPTY_CONFIG;
}
