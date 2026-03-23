import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class UpdateAgenceCompteDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  idtype?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  solde?: number;

  @IsOptional()
  @IsString()
  numero_compte?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/)
  pin_code?: string;
}
