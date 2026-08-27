import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class DepositDto {
  @IsOptional()
  @IsNumber()
  idclient: number;

  @IsNumber()
  idcompte: number;

  @IsNumber()
  @IsPositive()
  montant_transaction: number;

  @IsOptional()
  @IsNumber()
  iduser?: number;

  @IsString()
  @IsNotEmpty()
  operateur: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  numero_telephone: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9._-]+$/)
  references?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
