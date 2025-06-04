import { IsUrl, IsNotEmpty, IsArray, IsOptional, IsIn, IsInt, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RenderUrlDto {
  @ApiProperty({
    description: 'URL для пререндера',
    example: 'https://example.com',
  })
  @IsUrl({}, { message: 'URL должен быть валидным' })
  @IsNotEmpty({ message: 'URL не может быть пустым' })
  url: string;
}

export class BatchRenderDto {
  @ApiProperty({
    description: 'Массив URL для пререндера',
    example: ['https://example.com/page1', 'https://example.com/page2'],
    type: [String],
  })
  @IsArray({ message: 'urls должен быть массивом' })
  @IsUrl({}, { each: true, message: 'Каждый URL должен быть валидным' })
  @Transform(({ value }) => Array.isArray(value) ? value.slice(0, 10) : value)
  urls: string[];
}

export class WarmupDto extends BatchRenderDto {
  @ApiPropertyOptional({
    description: 'Приоритет прогрева',
    example: 'normal',
    enum: ['low', 'normal', 'high'],
  })
  @IsOptional()
  @IsIn(['low', 'normal', 'high'])
  priority?: 'low' | 'normal' | 'high' = 'normal';
}

export class ClearCacheDto {
  @ApiProperty({
    description: 'Тип кэша для очистки',
    example: 'all',
    enum: ['all', 'pages', 'resources'],
  })
  @IsIn(['all', 'pages', 'resources'], { 
    message: 'type должен быть одним из: all, pages, resources' 
  })
  type: 'all' | 'pages' | 'resources';
}

export class GetLogsDto {
  @ApiPropertyOptional({
    description: 'Уровень логов',
    example: 'info',
    enum: ['all', 'error', 'warn', 'info', 'debug'],
  })
  @IsOptional()
  @IsIn(['all', 'error', 'warn', 'info', 'debug'])
  level?: string = 'all';

  @ApiPropertyOptional({
    description: 'Количество логов',
    example: 100,
    minimum: 1,
    maximum: 1000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit должен быть числом' })
  @Min(1, { message: 'limit должен быть больше 0' })
  @Max(1000, { message: 'limit не может быть больше 1000' })
  limit?: number = 100;
} 