import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Structured error responses (SRS §107). Users never see SQLSTATE, stack
 * traces or internal details — only a code + a human-readable message.
 *
 * Shape: `{ error: { code, message, details? }, timestamp, path }`
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'server';
    let message = 'Something went wrong. Please try again.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        code = (r.code as string) ?? mapStatusToCode(status);
        message = (r.message as string) ?? message;
        details = r.details ?? r.error;
        // class-validator: collect all messages into a readable string.
        if (Array.isArray(r.message)) {
          message = (r.message as string[]).join(', ');
          code = 'validation';
        }
      }
    } else {
      // Log the real error server-side, but never leak it to the client.
      this.logger.error(`Unhandled exception: ${String(exception)}`);
    }

    response.status(status).json({
      error: { code, message, ...(details ? { details } : {}) },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

function mapStatusToCode(status: number): string {
  return {
    400: 'bad_request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    409: 'conflict',
    422: 'validation',
    429: 'rate_limited',
    500: 'server',
  }[status] ?? 'server';
}
