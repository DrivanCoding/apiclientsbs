import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateAdminOperatorActivationDto {
  @IsBoolean()
  @IsNotEmpty()
  actif: boolean;
}

