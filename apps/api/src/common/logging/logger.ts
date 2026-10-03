import { LoggerService } from '@nestjs/common';
import { currentRequestId } from './request-context';

/**
 * Structured JSON logs (spec §61). Sensitive keys are redacted before writing.
 */
const REDACT = /pass(word)?|token|secret|authorization|cookie|reflection|signature|sig|storageKey|url$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

function write(level: string, event: string, fields?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const requestId = currentRequestId();
  const line = JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...(requestId ? { requestId } : {}), ...(redact(fields ?? {}) as object) });
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};

export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string) {
    write('info', 'nest', { message: String(message), context });
  }
  error(message: unknown, trace?: string, context?: string) {
    write('error', 'nest', { message: String(message), context, trace: process.env.NODE_ENV === 'production' ? undefined : trace });
  }
  warn(message: unknown, context?: string) {
    write('warn', 'nest', { message: String(message), context });
  }
  debug() {}
  verbose() {}
}
