import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateAdminOperatorDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  nom: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 30)
  code: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  idtype?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  idtype_credit?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  idtype_debit?: number;
}
