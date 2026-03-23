import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdminUserDto {
  @IsNumber()
  @Min(1)
  idag: number;

  @IsString()
  @IsNotEmpty()
  nom: string;

  @IsString()
  @IsNotEmpty()
  prenom: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  login?: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
