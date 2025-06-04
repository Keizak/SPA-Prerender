import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BrowserPoolService } from './core/browser-pool.service';
import { HealthCheck } from './common/interfaces/prerender.interface';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly browserPoolService: BrowserPoolService) {}

  @Get('health')
  @ApiOperation({ summary: 'Проверка состояния сервиса' })
  @ApiResponse({ status: 200, description: 'Состояние сервиса' })
  async getHealth(): Promise<HealthCheck> {
    try {
      const browserStats = this.browserPoolService.getStats();
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
} 