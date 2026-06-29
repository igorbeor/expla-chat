import { Pipe, PipeTransform } from '@angular/core';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Formats an ISO timestamp as a compact relative label:
 * `now` (<1m), `12m`, `1h`, `2d`. Pure: recomputes only when its input changes.
 */
@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  public transform(value: string | null | undefined): string {
    if (!value) return '';

    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return '';

    const diff = Date.now() - then;
    if (diff < MINUTE) return 'now';
    if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
    if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
    return `${Math.floor(diff / DAY)}d`;
  }
}
