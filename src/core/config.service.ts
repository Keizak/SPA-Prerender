import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  AppConfig, 
  ServerConfig, 
  BrowserConfig, 
  CacheConfig, 
  PerformanceConfig, 
  LoggingConfig, 
  SecurityConfig 
} from '../common/interfaces/config.interface';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get server(): ServerConfig {
    return this.configService.get<ServerConfig>('server', {
      port: 3010,
      host: '0.0.0.0'
    });
  }

  get browser(): BrowserConfig {
    return this.configService.get<BrowserConfig>('browser', {
      poolSize: 3,
      options: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--memory-pressure-off',
          '--max_old_space_size=4096'
        ]
      }
    });
  }

  get cache(): CacheConfig {
    return this.configService.get<CacheConfig>('cache', {
      pages: {
        ttl: 3600,
        maxKeys: 1000,
        checkperiod: 120
      },
      resources: {
        maxSize: 10000
      }
    });
  }

  get performance(): PerformanceConfig {
    return this.configService.get<PerformanceConfig>('performance', {
      maxConcurrentRenders: 10,
      renderTimeout: 30000,
      pageWaitTime: 4000
    });
  }

  get logging(): LoggingConfig {
    return this.configService.get<LoggingConfig>('logging', {
      level: 'info',
      maxFiles: 5,
      maxsize: 10485760
    });
  }

  get security(): SecurityConfig {
    return this.configService.get<SecurityConfig>('security', {
      allowedDomains: [],
      maxUrlLength: 2048
    });
  }

  get port(): number {
    return this.configService.get<number>('PORT') || this.server.port;
  }

  get isDevelopment(): boolean {
    return this.configService.get('NODE_ENV') !== 'production';
  }

  get isProduction(): boolean {
    return this.configService.get('NODE_ENV') === 'production';
  }

  get telegramBotToken(): string | undefined {
    return process.env.TELEGRAM_BOT_TOKEN || this.configService.get<string>('TELEGRAM_BOT_TOKEN');
  }

  get telegramChatId(): string | undefined {
    return process.env.TELEGRAM_CHAT_ID || this.configService.get<string>('TELEGRAM_CHAT_ID');
  }
} 