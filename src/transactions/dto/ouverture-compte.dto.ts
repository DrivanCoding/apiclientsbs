import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
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
  numero_telephone: string;

  @IsOptional()
  @IsString()
  references?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
