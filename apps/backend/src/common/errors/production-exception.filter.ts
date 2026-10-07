import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { sanitizeRequestPath } from '../security/sensitive-data.util';

@Catch()
export class ProductionExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(ProductionExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (process.env.NODE_ENV !== 'production' || status < 500) {
      super.catch(exception, host);
      return;
    }

    const context = host.switchToHttp();
    const request = context.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();
    const response = context.getResponse();
    const errorName =
      exception instanceof Error ? exception.constructor.name : 'UnknownError';

    this.logger.error(
      JSON.stringify({
        event: 'http_request_failed',
        method: request.method ?? 'UNKNOWN',
        path: sanitizeRequestPath(request.originalUrl ?? request.url),
        statusCode: status,
        errorName,
      }),
    );
    this.adapterHost.httpAdapter.reply(
      response,
      {
        statusCode: status,
        message: 'Internal server error',
      },
      status,
    );
  }
}
