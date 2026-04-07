import type { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import * as swaggerDocument from './openapi.json';
import { LOG_PREFIX } from './constants/logging';

/** Base path for Swagger UI and the downloadable OpenAPI document. */
export const SWAGGER_UI_MOUNT_PATH = '/rest/custom/docs';

const spec = swaggerDocument as unknown as Record<string, unknown>;

/**
 * - Production: enabled only when `ENABLE_SWAGGER_UI=true`.
 * - Non-production: enabled unless `ENABLE_SWAGGER_UI=false`.
 */
export function isSwaggerUiEnabled(): boolean {
  const flag = process.env.ENABLE_SWAGGER_UI;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

export function mountSwaggerUi(app: Application): void {
  if (!isSwaggerUiEnabled()) {
    console.info(
      `${LOG_PREFIX} Swagger UI not mounted: n8n usually runs with NODE_ENV=production; set ENABLE_SWAGGER_UI=true to enable (or ENABLE_SWAGGER_UI=false to keep off).`,
    );
    return;
  }

  const jsonPath = `${SWAGGER_UI_MOUNT_PATH}/openapi.json`;
  app.get(jsonPath, (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(spec);
  });

  app.use(
    SWAGGER_UI_MOUNT_PATH,
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'CHWF External Hooks API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
      },
    }),
  );

  console.info(`${LOG_PREFIX} Swagger UI: ${SWAGGER_UI_MOUNT_PATH} (OpenAPI: ${jsonPath})`);
}
