import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdminAgenceDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  idag?: number;

  @IsNumber()
  @Min(1)
  idcompagnie: number;

  @IsString()
  @IsNotEmpty()
  nom_agence: string;

  @IsOptional()
  @IsString()
  alias_agence?: string;

  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @IsString()
  telephone_agence?: string;

  @IsOptional()
  @IsString()
  date_ouverture?: string;

  @IsOptional()
  @IsString()
  @IsIn(['actif', 'hors_service'])
  statut_agence?: 'actif' | 'hors_service';
}
