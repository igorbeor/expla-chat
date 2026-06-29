import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Message composer. Holds its own draft text; emits `send` with the trimmed
 * value on Enter (without Shift) or the send button. Empty/whitespace-only
 * drafts are blocked. Clears after a successful send.
 */
@Component({
  selector: 'app-message-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-input.html',
  styleUrl: './message-input.scss',
})
export class MessageInput {
  public readonly disabled = input<boolean>(false);
  public readonly send = output<string>();

  protected readonly text = signal('');
  protected readonly canSend = computed(
    () => !this.disabled() && this.text().trim().length > 0,
  );

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(): void {
    const trimmed = this.text().trim();
    if (trimmed.length === 0 || this.disabled()) return;
    this.send.emit(trimmed);
    this.text.set('');
  }
}
