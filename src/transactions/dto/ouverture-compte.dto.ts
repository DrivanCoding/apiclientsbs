import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class OuvertureCompteDto {
  @IsNumber()
  @Min(1)
  idtype: number;

  @IsNumber()
  @IsPositive()
  montant_initial: number;

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
