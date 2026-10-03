import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';
import { AppError } from '../errors/app-error';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { log } from '../logging/logger';
import { currentRequestId } from '../logging/request-context';

/**
 * Every error leaves the API as { success: false, error: { code, message, details? } }.
 * Stack traces, SQL and internal messages are never sent to clients in production.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const { status, code, message, details } = this.map(exception);

    if (status >= 500) {
      log.error('request_failed', {
        method: req.method,
        path: req.route?.path ?? req.path,
        status,
        code,
        error: exception instanceof Error ? exception.message : String(exception),
        stack: this.config.isProd ? undefined : exception instanceof Error ? exception.stack : undefined,
      });
    }

    const requestId = currentRequestId();
    res.status(status).json({
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}), ...(requestId ? { requestId } : {}) },
    });
  }

  private map(e: unknown): { status: number; code: string; message: string; details?: unknown } {
    if (e instanceof AppError) return { status: e.status, code: e.code, message: e.message, details: e.details };
    if (e instanceof ThrottlerException)
      return { status: 429, code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' };
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const body = e.getResponse() as { message?: string | string[]; code?: string } | string;
      if (status === HttpStatus.BAD_REQUEST && typeof body === 'object' && Array.isArray(body.message)) {
        return { status, code: 'VALIDATION_ERROR', message: 'Some fields are invalid.', details: body.message };
      }
      const message = typeof body === 'string' ? body : Array.isArray(body.message) ? body.message.join(', ') : body.message ?? e.message;
      return { status, code: CODE_BY_STATUS[status] ?? 'HTTP_ERROR', message };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { status: 409, code: 'CONFLICT', message: 'This record already exists.' };
      if (e.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: 'The record could not be found.' };
    }
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: this.config.isProd ? 'Something went wrong. Please try again.' : e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};
