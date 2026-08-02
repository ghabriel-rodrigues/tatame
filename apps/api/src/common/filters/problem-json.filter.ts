import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCodes, ProblemException, type ProblemBody } from '../problem.js';

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

/**
 * Global RFC 9457 filter (API ticket 04): every error leaves the API as
 * `application/problem+json` with a stable `code` from the shared registry.
 */
@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemJsonFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCodes.INTERNAL;
    let detail: string | undefined;
    let errors: ProblemBody['errors'];

    if (exception instanceof ProblemException) {
      status = exception.getStatus();
      code = exception.code;
      detail = (exception.getResponse() as { detail?: string }).detail;
      errors = exception.errors;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'code' in body) {
        code = String((body as { code: unknown }).code);
      } else {
        code =
          status === HttpStatus.NOT_FOUND
            ? ErrorCodes.NOT_FOUND
            : status === HttpStatus.UNAUTHORIZED
              ? ErrorCodes.AUTH_UNAUTHENTICATED
              : ErrorCodes.INTERNAL;
      }
      detail =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message?.toString() ?? undefined);
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const problem: ProblemBody = {
      type: `https://tatame.app/problems/${code}`,
      title: TITLES[status] ?? 'Error',
      status,
      ...(detail ? { detail } : {}),
      instance: request.originalUrl ?? request.url,
      code,
      ...(errors ? { errors } : {}),
    };

    response.status(status).type('application/problem+json').json(problem);
  }
}
