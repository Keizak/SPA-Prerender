import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrerenderService } from '../prerender/prerender.service';
import { CacheService } from '../../core/cache.service';
import { BrowserPoolService } from '../../core/browser-pool.service';
import { ClearCacheDto, GetLogsDto } from '../../common/dto/prerender.dto';
import { HealthCheck, SystemStats } from '../../common/interfaces/prerender.interface';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('Admin')
@Controller('api/admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly prerenderService: PrerenderService,
    private readonly cacheService: CacheService,
    private readonly browserPoolService: BrowserPoolService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Получение статистики системы' })
  @ApiResponse({ status: 200, description: 'Статистика системы' })
  async getStats() {
    const stats = await this.prerenderService.getStats();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    const systemStats: SystemStats = {
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      },
      uptime: Math.round(uptime),
      nodeVersion: process.version,
      platform: process.platform,
    };

    return {
      ...stats,
      system: systemStats,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('cache/clear')
  @ApiOperation({ summary: 'Очистка кэша' })
  @ApiResponse({ status: 200, description: 'Кэш очищен' })
  async clearCache(@Body(ValidationPipe) body: ClearCacheDto) {
    switch (body.type) {
      case 'pages':
        await this.cacheService.clearPageCache();
        break;
      case 'resources':
        await this.cacheService.clearResourceCache();
        break;
      case 'all':
      default:
        await this.cacheService.clearAll();
    }

    this.logger.log(`Кэш очищен: ${body.type}`);
    return {
      message: `Кэш "${body.type}" очищен`,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('stats/reset')
  @ApiOperation({ summary: 'Сброс статистики' })
  @ApiResponse({ status: 200, description: 'Статистика сброшена' })
  async resetStats() {
    this.prerenderService.resetStats();

    this.logger.log('Статистика сброшена');
    return {
      message: 'Статистика сброшена',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('logs')
  @ApiOperation({ summary: 'Получение логов' })
  @ApiResponse({ status: 200, description: 'Список логов' })
  async getLogs(@Query(ValidationPipe) query: GetLogsDto) {
    try {
      const logsDir = path.join(process.cwd(), 'logs');
      let logs: any[] = [];

      try {
        const combinedLogPath = path.join(logsDir, 'combined.log');
        const logContent = await fs.promises.readFile(combinedLogPath, 'utf8');
        const logLines = logContent.trim().split('\n').slice(-query.limit!);

        logs = logLines.map(line => {
          try {
            const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) \[(\w+)\]: (.+)$/);
            if (match) {
              return {
                timestamp: match[1],
                level: match[2].toLowerCase(),
                message: match[3],
              };
            }
            return { timestamp: null, level: 'unknown', message: line };
          } catch (e) {
            return { timestamp: null, level: 'unknown', message: line };
          }
        });

        // Фильтрация по уровню
        if (query.level !== 'all') {
          logs = logs.filter(log => log.level === query.level?.toLowerCase());
        }
      } catch (error) {
        logs = [{
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: 'Файл логов не найден или пуст',
        }];
      }

      return {
        logs: logs.reverse(),
        totalShown: logs.length,
        filters: { limit: query.limit, level: query.level },
      };
    } catch (error) {
      this.logger.error('Ошибка получения логов:', error);
      throw error;
    }
  }

  @Get('health')
  @ApiOperation({ summary: 'Проверка здоровья системы' })
  @ApiResponse({ status: 200, description: 'Состояние системы' })
  async getHealth(): Promise<HealthCheck> {
    try {
      const browserStats = this.browserPoolService.getStats();
      const cacheStats = await this.cacheService.getStats();
      const memoryUsage = process.memoryUsage();

      const checks = {
        browsers: {
          status: browserStats.total > 0 ? 'ok' as const : 'error' as const,
          message: `${browserStats.free}/${browserStats.total} браузеров свободно`,
        },
        memory: {
          status: memoryUsage.heapUsed < 1024 * 1024 * 1024 ? 'ok' as const : 'warning' as const,
          message: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB использовано`,
        },
        cache: {
          status: 'ok' as const,
          message: `${cacheStats.pages.keys} страниц, ${cacheStats.resources.keys} ресурсов`,
        },
      };

      const hasErrors = Object.values(checks).some(check => check.status === 'error');
      const hasWarnings = Object.values(checks).some(check => check.status === 'warning');

      const status = hasErrors ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy';

      return {
        status,
        checks,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        checks: {
          error: {
            status: 'error',
            message: error.message,
          },
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('browsers/restart')
  @ApiOperation({ summary: 'Перезапуск браузеров' })
  @ApiResponse({ status: 200, description: 'Браузеры перезапущены' })
  async restartBrowsers() {
    this.logger.log('Перезапуск пула браузеров');

    await this.browserPoolService.close();
    // Браузеры автоматически перезапустятся при следующем запросе

    return {
      message: 'Пул браузеров перезапущен',
      timestamp: new Date().toISOString(),
    };
  }
} 