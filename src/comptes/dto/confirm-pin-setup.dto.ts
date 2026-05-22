import { IsNotEmpty, IsNumber, IsString, Matches, Min } from 'class-validator';

export class ConfirmPinSetupDto {
  @IsNumber()
  @Min(1)
  idclient: number;

  @IsNumber()
  @Min(1)
  idcompte: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,6}$/)
  pin_code: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/)
  otp_code: string;
}
