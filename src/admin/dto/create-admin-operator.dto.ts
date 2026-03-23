import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

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
}

