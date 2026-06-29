import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConversationService } from './services/conversation/conversation.service';
import { Sidebar } from './features/sidebar/sidebar';
import { Chat } from './features/chat/chat';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Sidebar, Chat],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly conversation = inject(ConversationService);
}
