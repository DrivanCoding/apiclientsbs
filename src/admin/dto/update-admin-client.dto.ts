import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateAdminClientDto {
  @IsOptional()
  @IsString()
  @Length(1, 20)
  code_client?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  nom?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  prenom?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  piece_identite?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  num_piece_identite?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  adresse?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  code_postal?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  ville?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  telephone_principal?: string;

  @IsOptional()
  @IsString()
  @Length(4, 72)
  mot_de_passe?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idag?: number;
}
