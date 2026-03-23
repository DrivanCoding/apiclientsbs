import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class VerifyComptePinDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,6}$/)
  pin_code: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idclient?: number;
}
