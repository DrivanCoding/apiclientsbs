import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateAdminAgenceDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  idcompagnie?: number;

  @IsOptional()
  @IsString()
  nom_agence?: string;

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
  @IsIn(['actif', 'hors_service'])
  statut_agence?: 'actif' | 'hors_service';
}
