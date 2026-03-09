import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class PreouvertureDto {
  @IsString()
  @IsNotEmpty()
  nom: string;

  @IsOptional()
  @IsString()
  prenom?: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  telephone_principal: string;

  @IsString()
  @IsNotEmpty()
  mot_de_passe: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idtype?: number;

  @IsOptional()
  @IsString()
  type_compte?: string;

  @IsNumber()
  @IsPositive()
  montant_initial: number;

  @IsString()
  @IsNotEmpty()
  operateur: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idag?: number;

  @IsOptional()
  @IsString()
  references?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
