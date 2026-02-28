import type { NotificationPlugin, NotificationPayload } from '../types';
import nodemailer from 'nodemailer';
import { statusIcon } from '../statusIcons';

export const smtpPlugin: NotificationPlugin = {
  type: 'smtp',
  name: 'Email (SMTP)',
  description: 'Send email notifications via SMTP',
  configFields: [
    { key: 'host', label: 'SMTP Host', type: 'text', required: true, placeholder: 'smtp.gmail.com' },
    { key: 'port', label: 'SMTP Port', type: 'number', required: true, placeholder: '587' },
    { key: 'secure', label: 'Use TLS', type: 'boolean' },
    { key: 'username', label: 'Username', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
    { key: 'from', label: 'From Address', type: 'text', required: true, placeholder: 'alerts@example.com' },
    { key: 'to', label: 'To Address(es)', type: 'text', required: true, placeholder: 'admin@example.com' },
  ],

  async send(config, payload) {
    const icon = statusIcon(payload.newStatus);
    const transport = nodemailer.createTransport({
      host: String(config.host),
      port: Number(config.port),
      secure: Boolean(config.secure),
      auth: {
        user: String(config.username),
        pass: String(config.password),
      },
    });

    await transport.sendMail({
      from: String(config.from),
      to: String(config.to),
      subject: `${icon} ${payload.monitorName} is ${payload.newStatus.toUpperCase()}`,
      text: [
        `Monitor: ${payload.monitorName}`,
        `Status: ${payload.oldStatus} → ${payload.newStatus}`,
        payload.message ? `Message: ${payload.message}` : '',
        payload.monitorUrl ? `URL: ${payload.monitorUrl}` : '',
        `Time: ${payload.timestamp}`,
      ].filter(Boolean).join('\n'),
      html: [
        `<h2>${icon} ${payload.monitorName}</h2>`,
        `<p><strong>Status:</strong> ${payload.oldStatus} → <strong>${payload.newStatus.toUpperCase()}</strong></p>`,
        payload.message ? `<p>${payload.message}</p>` : '',
        payload.monitorUrl ? `<p><a href="${payload.monitorUrl}">${payload.monitorUrl}</a></p>` : '',
        `<p><small>${payload.timestamp}</small></p>`,
      ].filter(Boolean).join('\n'),
    });
  },

  async sendTest(config) {
    await this.send(config, {
      monitorName: 'Test Monitor',
      oldStatus: 'up',
      newStatus: 'down',
      message: 'Test from Obliview',
      timestamp: new Date().toISOString(),
    });
  },
};
