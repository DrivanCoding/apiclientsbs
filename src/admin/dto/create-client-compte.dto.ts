import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateClientCompteDto {
  @IsNumber()
  @Min(1)
  idtype: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  solde_initial?: number;

  @IsOptional()
  @IsString()
  numero_compte?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,6}$/)
  pin_code: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idag?: number;
}

