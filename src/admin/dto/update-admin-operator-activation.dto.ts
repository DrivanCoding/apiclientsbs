import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateAdminOperatorActivationDto {
  @IsBoolean()
  @IsOptional()
  actif?: boolean;

  @IsString()
  @Length(1, 100)
  @IsOptional()
  nom?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  idtype_credit?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  idtype_debit?: number;
}
