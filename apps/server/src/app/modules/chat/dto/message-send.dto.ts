import { MessageSendRequest } from '@chat/api-interfaces';
import { IsUUID, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class MessageSendDto implements MessageSendRequest {
  @IsUUID()
  recipientId!: string;

  @Transform(({ value }) => value?.trim())
  @Length(1, 500)
  content!: string;
}
