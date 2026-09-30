import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CoreValidationDto {
  @IsIn(['posted', 'rejected'])
  status: 'posted' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
