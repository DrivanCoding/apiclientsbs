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
  @IsString()
  type_piece?: string;

  @IsOptional()
  @IsString()
  num_piece_identite?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsString()
  code_postal?: string;

  @IsOptional()
  @IsString()
  ville?: string;

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

  @IsNumber()
  @Min(1)
  idag: number;

  @IsOptional()
  @IsString()
  references?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
