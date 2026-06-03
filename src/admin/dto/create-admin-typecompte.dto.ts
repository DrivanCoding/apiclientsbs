import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateAdminTypecompteDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  idtype?: number;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  libelle: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taux_interet?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  frais_tenue_compte?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  plafond?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  frais_ouverture?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  frais_retrait?: number;

  @IsOptional()
  @IsString()
  @Length(1, 3)
  code_type?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idcategorie?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  numero?: number;

  @IsOptional()
  @IsString()
  @IsIn(['1', '2', '3'])
  type?: '1' | '2' | '3';

  @IsOptional()
  @IsNumber()
  @Min(1)
  idparent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  mobile_sync_enabled?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  mobile_can_open?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  mobile_can_view?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  mobile_can_deposit?: number;
}
