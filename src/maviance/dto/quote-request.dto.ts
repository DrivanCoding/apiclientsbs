import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class QuoteRequestDto {
  @IsString()
  @IsNotEmpty()
  payItemId: string;

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
