import { ConversationHistoryRequest } from '@chat/api-interfaces';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ConversationHistoryDto implements ConversationHistoryRequest {
  @IsUUID()
  interlocutorId!: string;

  @IsInt()
  @Min(1)
  @Max(25)
  limit!: number;

  @IsOptional()
  @IsUUID()
  before?: string | undefined;
}
