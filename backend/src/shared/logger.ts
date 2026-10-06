import pino, { type LoggerOptions } from 'pino';
import { env } from './env';

const pinoOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'req.body.password',
      'req.body.password_hash',
      '*.token',
      '*.jwt',
      '*.secret',
      '*.nic',
      '*.national_id',
      '*.passport_number',
      '*.phone_number',
      '*.clinical_notes',
      '*.consultation_text',
      '*.diagnosis',
      '*.prescription',
      '*.chief_complaint',
      '*.symptoms',
      'req.body.nic',
      'req.body.clinical_notes',
      'req.body.diagnosis',
      'req.body.treatment_notes',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'catms-api',
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

if (env.NODE_ENV === 'development') {
  pinoOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  };
}

export const logger = pino(pinoOptions);

export type Logger = typeof logger;

export function createChildLogger(moduleName: string): Logger {
  return logger.child({ module: moduleName });
}

