import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class QuoteRequestDto {
  @IsNumber()
  @IsNotEmpty()
  payItemId: number;

  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  amount: number;

  @IsNumber()
  @IsNotEmpty()
  idcompte: number;

  @IsOptional()
  @IsString()
  serviceNumber?: string;

  @IsOptional()
  @IsString()
  customerNumber?: string;
}
