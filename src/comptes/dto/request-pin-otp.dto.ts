import { IsNumber, Min } from 'class-validator';

export class RequestPinOtpDto {
  @IsNumber()
  @Min(1)
  idclient: number;

  @IsNumber()
  @Min(1)
  idcompte: number;
}
