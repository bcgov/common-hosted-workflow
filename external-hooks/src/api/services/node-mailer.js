"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeMailerService = void 0;
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const html_to_text_1 = require("html-to-text");
class NodeMailerService {
    sender;
    transport;
    constructor(baseNodeMailer) {
        this.sender = baseNodeMailer.sender;
        this.transport = baseNodeMailer.transport;
    }
    async sendMail({ to, subject, html, text, from, attachments = [] }) {
        const sanitizedHtml = (0, sanitize_html_1.default)(html);
        const plainText = text ?? (0, html_to_text_1.convert)(sanitizedHtml);
        await this.transport.sendMail({
            from: from ?? this.sender,
            to,
            subject,
            text: plainText,
            html: sanitizedHtml,
            attachments,
        });
    }
}
exports.NodeMailerService = NodeMailerService;
