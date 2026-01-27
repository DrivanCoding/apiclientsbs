import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class DepositDto {
  @IsNumber()
  idclient: number;

  @IsNumber()
  idcompte: number;

  @IsNumber()
  @IsPositive()
  montant_transaction: number;

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
