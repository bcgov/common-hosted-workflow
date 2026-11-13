'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.SWAGGER_UI_MOUNT_PATH = void 0;
exports.isSwaggerUiEnabled = isSwaggerUiEnabled;
exports.mountSwaggerUi = mountSwaggerUi;
const swagger_ui_express_1 = __importDefault(require('swagger-ui-express'));
const _config_1 = require('@config');
const swaggerDocument = __importStar(require('./openapi.json'));
const logger_1 = require('./utils/logger');
const log = (0, logger_1.createLogger)('CustomAPIs');
/** Base path for Swagger UI and the downloadable OpenAPI document. */
exports.SWAGGER_UI_MOUNT_PATH = '/rest/custom/docs';
const spec = swaggerDocument;
/**
 * - Production: enabled only when `ENABLE_SWAGGER_UI=true`.
 * - Non-production: enabled unless `ENABLE_SWAGGER_UI=false`.
 */
function isSwaggerUiEnabled() {
  if (_config_1.ENABLE_SWAGGER_UI === 'false') return false;
  if (_config_1.ENABLE_SWAGGER_UI === 'true') return true;
  return !_config_1.IS_PRODUCTION;
}
function mountSwaggerUi(app) {
  if (!isSwaggerUiEnabled()) {
    log.info(
      'Swagger UI not mounted: n8n usually runs with NODE_ENV=production; set ENABLE_SWAGGER_UI=true to enable (or ENABLE_SWAGGER_UI=false to keep off).',
    );
    return;
  }
  const jsonPath = `${exports.SWAGGER_UI_MOUNT_PATH}/openapi.json`;
  app.get(jsonPath, (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(spec);
  });
  app.use(
    exports.SWAGGER_UI_MOUNT_PATH,
    swagger_ui_express_1.default.serve,
    swagger_ui_express_1.default.setup(spec, {
      customSiteTitle: 'CHWF External Hooks API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
      },
    }),
  );
  log.info('Swagger UI mounted', { path: exports.SWAGGER_UI_MOUNT_PATH, openapi: jsonPath });
}
