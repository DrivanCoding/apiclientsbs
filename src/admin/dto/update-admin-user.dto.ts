import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  idag?: number;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  nom?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  prenom?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  login?: string;

  @IsOptional()
  @IsString()
  @Length(6, 72)
  password?: string;
}

