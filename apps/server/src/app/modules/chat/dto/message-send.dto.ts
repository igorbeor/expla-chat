import { MessageSendEvent } from '@chat/api-interfaces';
import { IsUUID, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class MessageSendDto implements MessageSendEvent {
  @IsUUID()
  recipientId!: string;

  @Transform(({ value }) => value?.trim())
  @Length(1, 500)
  content!: string;
}
