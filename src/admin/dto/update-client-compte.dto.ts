import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class UpdateClientCompteDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  idcompte?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idtype?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  solde?: number;

  @IsOptional()
  @IsString()
  numero_compte?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/)
  pin_code?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idag?: number;
}
