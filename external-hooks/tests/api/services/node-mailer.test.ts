import { describe, expect, it, vi } from 'vitest';
import { NodeMailerService } from '../../../src/api/services/node-mailer';

describe('NodeMailerService', () => {
  it('uses the base sender and defaults attachments to an empty array', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const service = new NodeMailerService({
      sender: 'default@example.com',
      transport: { sendMail },
    });

    await service.sendMail({
      to: 'person@example.com',
      subject: 'Hello',
      html: '<p>Hi there</p>',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'default@example.com',
      to: 'person@example.com',
      bcc: undefined,
      subject: 'Hello',
      text: 'Hi there',
      html: '<p>Hi there</p>',
      attachments: [],
    });
  });

  it('allows overriding from and sanitizes html before sending', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const service = new NodeMailerService({
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

    expect(sendMail).toHaveBeenCalledWith({
      from: 'override@example.com',
      to: ['person@example.com'],
      bcc: undefined,
      subject: 'Hello',
      text: 'Hello',
      html: '<p>Hello</p>',
      attachments: [{ filename: 'note.txt' }],
    });
  });

  it('passes through bcc recipients', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const service = new NodeMailerService({
      sender: 'default@example.com',
      transport: { sendMail },
    });

    await service.sendMail({
      to: 'default@example.com',
      bcc: ['admin1@example.com', 'admin2@example.com'],
      subject: 'Hello',
      html: '<p>Hello</p>',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'default@example.com',
      to: 'default@example.com',
      bcc: ['admin1@example.com', 'admin2@example.com'],
      subject: 'Hello',
      text: 'Hello',
      html: '<p>Hello</p>',
      attachments: [],
    });
  });
});
