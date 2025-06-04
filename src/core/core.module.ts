import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './config.service';
import { BrowserPoolService } from './browser-pool.service';
import { CacheService } from './cache.service';
import { AppLogger } from './logger.service';
import * as yaml from 'yaml';
import * as fs from 'fs';
import * as path from 'path';

// Загрузка YAML конфигурации
const loadConfig = () => {
  try {
    const configPath = path.join(process.cwd(), 'config.yaml');
    const fileContents = fs.readFileSync(configPath, 'utf8');
    return yaml.parse(fileContents);
  } catch (error) {
    console.error('Ошибка загрузки конфигурации:', error.message);
    return {};
  }
};

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      load: [loadConfig],
      isGlobal: true,
    }),
  ],
  providers: [
    AppConfigService,
    BrowserPoolService,
    CacheService,
    AppLogger,
  ],
  exports: [
    AppConfigService,
    BrowserPoolService,
    CacheService,
    AppLogger,
  ],
})
export class CoreModule {} 