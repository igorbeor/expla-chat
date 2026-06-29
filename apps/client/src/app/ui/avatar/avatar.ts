import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';

/**
 * Circular avatar. Renders the image; on load error (or when no URL is given)
 * falls back to the contact's initials. Size is driven by the `size` input via
 * a CSS custom property so the same component scales in lists, headers, etc.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
  host: {
    '[style.--avatar-size]': 'sizePx()',
  },
})
export class Avatar {
  public readonly avatarUrl = input<string>('');
  public readonly name = input<string>('');
  public readonly size = input<number>(40);

  protected readonly sizePx = computed(() => `${this.size()}px`);
  protected readonly failed = signal(false);

  protected readonly showImage = computed(
    () => !this.failed() && this.avatarUrl().trim().length > 0,
  );

  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  });

  protected onError(): void {
    this.failed.set(true);
  }
}
