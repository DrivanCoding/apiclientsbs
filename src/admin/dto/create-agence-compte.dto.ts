import { IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateAgenceCompteDto {
  @IsNumber()
  @Min(1)
  idtype: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  solde_initial?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  idclient?: number;

  @IsOptional()
  @IsString()
  numero_compte?: string;
}
