import { HttpStatus } from '@nestjs/common';

/** Domain error with a stable machine-readable code (spec §42). */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (entity: string) =>
  new AppError(`${entity.toUpperCase().replace(/\s+/g, '_')}_NOT_FOUND`, `${entity} could not be found.`, HttpStatus.NOT_FOUND);

export const conflict = (code: string, message: string) => new AppError(code, message, HttpStatus.CONFLICT);
export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN);
export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(code, message, HttpStatus.BAD_REQUEST, details);
