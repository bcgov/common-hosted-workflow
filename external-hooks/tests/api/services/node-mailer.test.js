'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const node_mailer_1 = require('../../../src/api/services/node-mailer');
(0, vitest_1.describe)('NodeMailerService', () => {
  (0, vitest_1.it)('uses the base sender and defaults attachments to an empty array', async () => {
    const sendMail = vitest_1.vi.fn().mockResolvedValue(undefined);
    const service = new node_mailer_1.NodeMailerService({
      sender: 'default@example.com',
      transport: { sendMail },
    });
    await service.sendMail({
      to: 'person@example.com',
      subject: 'Hello',
      html: '<p>Hi there</p>',
    });
    (0, vitest_1.expect)(sendMail).toHaveBeenCalledWith({
      from: 'default@example.com',
      to: 'person@example.com',
      subject: 'Hello',
      text: 'Hi there',
      html: '<p>Hi there</p>',
      attachments: [],
    });
  });
  (0, vitest_1.it)('allows overriding from and sanitizes html before sending', async () => {
    const sendMail = vitest_1.vi.fn().mockResolvedValue(undefined);
    const service = new node_mailer_1.NodeMailerService({
      sender: 'default@example.com',
      transport: { sendMail },
    });
    await service.sendMail({
      from: 'override@example.com',
      to: ['person@example.com'],
      subject: 'Hello',
      html: '<p>Hello</p><script>alert("x")</script>',
      attachments: [{ filename: 'note.txt' }],
    });
    (0, vitest_1.expect)(sendMail).toHaveBeenCalledWith({
      from: 'override@example.com',
      to: ['person@example.com'],
      subject: 'Hello',
      text: 'Hello',
      html: '<p>Hello</p>',
      attachments: [{ filename: 'note.txt' }],
    });
  });
});
