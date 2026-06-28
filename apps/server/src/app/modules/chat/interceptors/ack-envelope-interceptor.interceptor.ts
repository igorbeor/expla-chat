import { AckResult } from '@chat/api-interfaces';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { catchError, map, Observable, of } from 'rxjs';

@Injectable()
export class AckEnvelopeInterceptor implements NestInterceptor {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler,
  ): Observable<AckResult<unknown>> {
    return next.handle().pipe(
      map((data) => ({ ok: true as const, data })),
      catchError((err) =>
        of({ ok: false as const, error: this.toMessage(err) }),
      ),
    );
  }
  private toMessage(err: unknown): string {
    if (err instanceof WsException) return String(err.getError());
    if (err instanceof Error) return err.message;
    return 'Unexpected error';
  }
}
