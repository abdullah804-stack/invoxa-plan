/**
 * The one error shape in the API: { error: { code, message, details } }.
 * Codes are fixed by the plan's API reference; a client can switch on `code`.
 */

export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'AI_QUOTA',
  'AI_FAILED',
  'PAYLOAD_TOO_LARGE',
  'SERVER',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  AI_QUOTA: 429,
  AI_FAILED: 502,
  PAYLOAD_TOO_LARGE: 413,
  SERVER: 500,
};

export interface ErrorDetail {
  path?: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[];

  constructor(code: ErrorCode, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function errorBody(
  code: ErrorCode,
  message: string,
  details: ErrorDetail[] = [],
): { error: { code: ErrorCode; message: string; details: ErrorDetail[] } } {
  return { error: { code, message, details } };
}

export const errors = {
  validation: (details: ErrorDetail[] = [], message = 'Some fields are invalid') =>
    new AppError('VALIDATION', message, details),
  unauthenticated: (message = 'Sign in to continue') => new AppError('UNAUTHENTICATED', message),
  forbidden: (message = 'You do not have permission to do that') =>
    new AppError('FORBIDDEN', message),
  /**
   * A record in a business the user does not belong to returns 404, never 403,
   * so IDs cannot be probed.
   */
  notFound: (message = 'Not found') => new AppError('NOT_FOUND', message),
  conflict: (message = 'That already exists') => new AppError('CONFLICT', message),
  rateLimited: (message = 'Too many requests. Try again in a minute.') =>
    new AppError('RATE_LIMITED', message),
  payloadTooLarge: (message = 'That file is too large') =>
    new AppError('PAYLOAD_TOO_LARGE', message),
  server: (message = 'Something went wrong') => new AppError('SERVER', message),
};
