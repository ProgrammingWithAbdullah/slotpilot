import { pino, type Logger } from 'pino';

/** Masks an email for logs: "jane.doe@example.com" -> "j***e@example.com". */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (local.length <= 2) return `${local[0] ?? ''}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function createLogger(opts: { level: string; pretty: boolean }): Logger {
  return pino({
    level: opts.level,
    base: { service: 'slotpilot-api' },
    // Never log secrets, even by accident.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.apiKey',
        'apiKey',
      ],
      censor: '[redacted]',
    },
    ...(opts.pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
      : {}),
  });
}

export type { Logger };
