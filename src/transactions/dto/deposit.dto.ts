import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

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
  numero_telephone: string;

  @IsOptional()
  @IsString()
  references?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
