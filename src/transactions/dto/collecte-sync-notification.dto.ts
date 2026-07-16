import { IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CollecteSyncNotificationDto {
  @IsInt()
  idcompte: number;

  @IsNumber()
  @IsPositive()
  montant_transaction: number;

  @IsOptional()
  @IsInt()
  iduser?: number;

  @IsOptional()
  @IsString()
  references?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  date_transaction?: string;
}
