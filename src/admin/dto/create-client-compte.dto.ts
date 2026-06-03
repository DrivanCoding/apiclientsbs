import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateClientCompteDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  idcompte?: number;

  @IsNumber()
  @Min(1)
  idtype: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  solde_initial?: number;

  @IsOptional()
  @IsString()
  numero_compte?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,6}$/)
  pin_code: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idag?: number;
}
