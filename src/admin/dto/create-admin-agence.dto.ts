import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdminAgenceDto {
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
}
