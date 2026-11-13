"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountUi = mountUi;
const node_path_1 = __importDefault(require("node:path"));
const express_1 = require("express");
const ui_api_1 = require("../routes/ui-api");
function mountUi(app, routeContext, uiPath, externalUiEnabled) {
    if (!uiPath || !externalUiEnabled) {
        return;
    }
    const indexPath = node_path_1.default.resolve(uiPath, 'index.html');
    app.use('/ui', (0, express_1.static)(uiPath, { index: 'index.html' }));
    app.get(/^\/ui\/.*$/, (_req, res) => {
        res.sendFile(indexPath, (err) => {
            if (err) {
                res.status(404).send('UI asset not found');
            }
        });
    });
    app.use('/ui-api', (0, ui_api_1.buildUiApiRouter)(routeContext));
}
