"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountCustomApi = mountCustomApi;
const express_1 = require("express");
const actions_1 = require("../routes/actions");
const actors_1 = require("../routes/actors");
const admin_1 = require("../routes/admin");
const chefs_submission_1 = require("../routes/chefs-submission");
const grafana_projects_1 = require("../routes/grafana-projects");
const messages_1 = require("../routes/messages");
const multi_webhook_wait_1 = require("../routes/multi-webhook-wait");
const middlewares_1 = require("../middlewares");
const swagger_ui_1 = require("../swagger-ui");
function mountCustomApi(app, routeContext) {
    const v1Router = (0, express_1.Router)();
    v1Router.use((0, middlewares_1.createReadOnlyMiddleware)());
    v1Router.use('/admin', (0, admin_1.buildAdminRouter)(routeContext));
    v1Router.use((0, actors_1.buildActorRouter)(routeContext));
    v1Router.use((0, messages_1.buildMessageRouter)(routeContext));
    v1Router.use((0, actions_1.buildActionRouter)(routeContext));
    v1Router.use('/chefs', (0, chefs_submission_1.buildChefsSubmissionRouter)(routeContext));
    v1Router.use('/multi-webhook-wait', (0, multi_webhook_wait_1.buildMultiWebhookWaitRouter)(routeContext));
    v1Router.use('/obs/projects', (0, grafana_projects_1.buildGrafanaProjectsRouter)(routeContext));
    (0, swagger_ui_1.mountSwaggerUi)(app);
    app.use('/rest/custom/v1', v1Router);
}
