import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateAdminAppDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  nom_app: string;
}

