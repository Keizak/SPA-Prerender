import {
  Controller,
  Get,
  Query,
  Res,
  HttpStatus,
  Body,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PrerenderService } from './prerender.service';
import { BatchRenderDto, WarmupDto } from '../../common/dto/prerender.dto';
import { CacheService } from '../../core/cache.service';
import { WarmupStatus } from '../../common/interfaces/prerender.interface';

@ApiTags('Prerender')
@Controller('api/prerender')
export class PrerenderController {
  constructor(
    private readonly prerenderService: PrerenderService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Пререндер страницы по URL (query)' })
  @ApiQuery({ name: 'url', description: 'URL для рендера', example: 'https://bonix.by' })
  @ApiResponse({ status: 200, description: 'HTML страницы' })
  @ApiResponse({ status: 400, description: 'Невалидный URL' })
  @ApiResponse({ status: 500, description: 'Ошибка рендера' })
  async renderPageByQuery(
    @Query('url') url: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!url) {
        res.status(HttpStatus.BAD_REQUEST).send('<html><body><h1>Ошибка</h1><pre>Параметр url обязателен</pre></body></html>');
        return;
      }
      const result = await this.prerenderService.render(url);
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'X-Prerender-Cache': result.fromCache ? 'HIT' : 'MISS',
        'X-Prerender-Duration': String(result.duration || 0),
      });
      res.status(HttpStatus.OK).send(result.html);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(
        `<html><body><h1>Ошибка пререндера</h1><pre>${error.message}</pre></body></html>`
      );
    }
  }

  @Post('render-batch')
  @ApiOperation({ summary: 'Batch пререндер нескольких URL' })
  @ApiResponse({ status: 200, description: 'Результаты рендера' })
  @ApiResponse({ status: 400, description: 'Невалидные данные' })
  async renderBatch(@Body(ValidationPipe) body: BatchRenderDto) {
    const results = await this.prerenderService.renderBatch(body.urls);
    return {
      results: results.map((result, index) => ({
        url: body.urls[index],
        success: result.success,
        fromCache: result.fromCache,
        duration: result.duration,
        error: result.error || null,
      })),
    };
  }

  @Post('warmup')
  @ApiOperation({ summary: 'Прогрев кэша' })
  @ApiResponse({ status: 200, description: 'Прогрев запущен' })
  @ApiResponse({ status: 400, description: 'Невалидные данные' })
  async warmupCache(@Body(ValidationPipe) body: WarmupDto) {
    await this.prerenderService.warmupCache(body.urls);
    return {
      message: `Запущен прогрев ${body.urls.length} страниц`,
      urls: body.urls,
      priority: body.priority,
    };
  }

  @Post('warmup-sitemap')
  @ApiOperation({ summary: 'Прогрев кэша по sitemap.xml' })
  @ApiQuery({ name: 'sitemap', description: 'Ссылка на sitemap.xml', example: 'https://site.by/sitemap.xml' })
  @ApiResponse({ status: 200, description: 'Старт задачи прогрева' })
  async warmupSitemap(@Query('sitemap') sitemap: string): Promise<WarmupStatus | { error: string }> {
    if (!sitemap) {
      return { error: 'Параметр sitemap обязателен' };
    }
    const status = await this.prerenderService.warmupBySitemap(sitemap);
    return status;
  }

  @Get('warmup-status')
  @ApiOperation({ summary: 'Статус прогрева кэша по sitemap.xml' })
  @ApiResponse({ status: 200, description: 'Статус задачи прогрева' })
  async getWarmupStatus(): Promise<WarmupStatus> {
    return this.prerenderService.getWarmupStatus();
  }

  @Get('status')
  @ApiOperation({ summary: 'Проверка статуса URL в кэше' })
  @ApiQuery({ name: 'url', description: 'URL для проверки', example: 'https://bonix.by' })
  @ApiResponse({ status: 200, description: 'Статус URL и информация о кэше' })
  async getUrlStatus(@Query('url') url: string) {
    const cacheInfo = await this.cacheService.getPageCacheInfo(url);
    return {
      url,
      ...cacheInfo,
    };
  }
} 