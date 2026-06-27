import { SendMessagePayload } from '@chat/api-interfaces';
import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class SendMessageDto implements SendMessagePayload {
  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  @Transform(({ value }) => value?.trim())
  @Length(1, 200)
  content!: string;

  @IsUUID()
  clientMsgId!: string;
}
