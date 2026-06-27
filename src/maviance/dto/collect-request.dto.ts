import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CollectRequestDto {
  @IsString()
  @IsNotEmpty()
  quoteId: string;

  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  idcompte: number; // The target bank account to credit upon payment success

  @IsString()
  @IsNotEmpty()
  customerPhonenumber: string;

  @IsEmail()
  @IsNotEmpty()
  customerEmailaddress: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsString()
  serviceNumber?: string;

  @IsOptional()
  @IsString()
  customerNumber?: string;

  @IsOptional()
  @IsString()
  trid?: string; // Optional merchant transaction ID
}
