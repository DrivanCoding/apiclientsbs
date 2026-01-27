import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class DepositDto {
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

  @IsString()
  references?: string;

  @IsString()
  description?: string;
}
