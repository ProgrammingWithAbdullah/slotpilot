import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';

export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req) => (req as unknown as { id: string }).id,
    // Health checks would drown the logs.
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  });
}
