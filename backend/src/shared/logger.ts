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
      'token',
      '*.token',
      'jwt',
      '*.jwt',
      'secret',
      '*.secret',
      'nic',
      '*.nic',
      'national_id',
      '*.national_id',
      'identity_number',
      '*.identity_number',
      'identityNumber',
      '*.identityNumber',
      'passport',
      '*.passport',
      'passport_number',
      '*.passport_number',
      'phone_number',
      '*.phone_number',
      'contact_number',
      '*.contact_number',
      'contactNumber',
      '*.contactNumber',
      'phone',
      '*.phone',
      'patient_name',
      '*.patient_name',
      'patientName',
      '*.patientName',
      'first_name',
      '*.first_name',
      'last_name',
      '*.last_name',
      'full_name',
      '*.full_name',
      'emergency_contact',
      '*.emergency_contact',
      'emergencyContacts',
      '*.emergencyContacts',
      'clinical_notes',
      '*.clinical_notes',
      'consultation_text',
      '*.consultation_text',
      'diagnosis',
      '*.diagnosis',
      'prescription',
      '*.prescription',
      'chief_complaint',
      '*.chief_complaint',
      'symptoms',
      '*.symptoms',
      'detail',
      '*.detail',
      'req.body.nic',
      'req.body.identityNumber',
      'req.body.identity_number',
      'req.body.patientName',
      'req.body.emergencyContacts',
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

