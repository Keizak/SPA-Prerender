import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from './config.service';
import { CacheStats } from '../common/interfaces/prerender.interface';

interface CachedPage {
  html: string;
  timestamp: number;
  size: number;
  createdAt: number;
  ttl: number;
}

interface CachedResource {
  data: any;
  timestamp: number;
  size: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;
  private maxResourceCacheSize: number;
  private redisPrefix: string;

  private stats = {
    pageHits: 0,
    pageMisses: 0,
    resourceHits: 0,
    resourceMisses: 0,
  };

  constructor(private readonly configService: AppConfigService) {
    const cacheConfig = this.configService.cache;
    const redisConfig = cacheConfig.redis || { host: '127.0.0.1', port: 6379 };
    this.redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      keyPrefix: redisConfig.keyPrefix || 'prerender:',
    });
    this.maxResourceCacheSize = cacheConfig.resources.maxSize;
    this.redisPrefix = redisConfig.keyPrefix || 'prerender:';
  }

  // Кэш страниц через Redis
  async getPage(url: string): Promise<CachedPage | null> {
    const data = await this.redis.get(`page:${url}`);
    if (data) {
      this.stats.pageHits++;
      this.logger.debug(`Кэш попадание (страница): ${url}`);
      return JSON.parse(data);
    }
    this.stats.pageMisses++;
    this.logger.debug(`Кэш промах (страница): ${url}`);
    return null;
  }

  async setPage(url: string, html: string, ttl?: number): Promise<void> {
    const cacheConfig = this.configService.cache;
    const effectiveTtl = ttl || cacheConfig.pages.ttl || 3600;
    const cached: CachedPage = {
      html,
      timestamp: Date.now(),
      size: Buffer.byteLength(html, 'utf8'),
      createdAt: Date.now(),
      ttl: effectiveTtl,
    };
    await this.redis.set(`page:${url}`, JSON.stringify(cached), 'EX', effectiveTtl);
    this.logger.debug(`Страница сохранена в кэш (Redis): ${url}`);
  }

  async deletePage(url: string): Promise<void> {
    await this.redis.del(`page:${url}`);
    this.logger.debug(`Страница удалена из кэша (Redis): ${url}`);
  }

  async getPageCacheInfo(url: string): Promise<{ exists: boolean; createdAt?: number; expiresAt?: number; ttl?: number; remaining?: number }> {
    const data = await this.redis.get(`page:${url}`);
    if (!data) return { exists: false };
    const cached: CachedPage = JSON.parse(data);
    const ttl = cached.ttl;
    const createdAt = cached.createdAt;
    const expiresAt = createdAt + ttl * 1000;
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    return { exists: true, createdAt, expiresAt, ttl, remaining };
  }

  // Кэш ресурсов через Redis
  async getResource(url: string): Promise<CachedResource | null> {
    const data = await this.redis.get(`resource:${url}`);
    if (data) {
      this.stats.resourceHits++;
      this.logger.debug(`Кэш попадание (ресурс): ${url}`);
      return JSON.parse(data);
    }
    this.stats.resourceMisses++;
    this.logger.debug(`Кэш промах (ресурс): ${url}`);
    return null;
  }

  async setResource(url: string, data: any): Promise<void> {
    // Лимит размера кэша ресурсов реализовать через Redis сложно, можно использовать TTL или sorted set для контроля, но пока просто set с TTL
    const cacheConfig = this.configService.cache;
    const cached: CachedResource = {
      data,
      timestamp: Date.now(),
      size: Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, 'utf8'),
    };
    // TTL для ресурсов можно задать отдельно, если нужно
    await this.redis.set(`resource:${url}`, JSON.stringify(cached));
    this.logger.debug(`Ресурс сохранен в кэш (Redis): ${url}`);
  }

  async deleteResource(url: string): Promise<void> {
    await this.redis.del(`resource:${url}`);
    this.logger.debug(`Ресурс удален из кэша (Redis): ${url}`);
  }

  // Очистка кэшей
  async clearPageCache(): Promise<void> {
    const keys = await this.redis.keys('page:*');
    if (keys.length > 0) await this.redis.del(keys);
    this.logger.log('Кэш страниц очищен (Redis)');
  }

  async clearResourceCache(): Promise<void> {
    const keys = await this.redis.keys('resource:*');
    if (keys.length > 0) await this.redis.del(keys);
    this.logger.log('Кэш ресурсов очищен (Redis)');
  }

  async clearAll(): Promise<void> {
    await this.clearPageCache();
    await this.clearResourceCache();
    this.resetStats();
    this.logger.log('Все кэши очищены (Redis)');
  }

  // Статистика
  async getStats(): Promise<CacheStats> {
    const pageKeys = await this.redis.keys('page:*');
    const resourceKeys = await this.redis.keys('resource:*');
    // Оценка памяти невозможна без Redis INFO, поэтому memoryUsage = 0
    return {
      pages: {
        keys: pageKeys.length,
        hits: this.stats.pageHits,
        misses: this.stats.pageMisses,
        hitRate: this.stats.pageHits / (this.stats.pageHits + this.stats.pageMisses) || 0,
        memoryUsage: 0,
      },
      resources: {
        keys: resourceKeys.length,
        hits: this.stats.resourceHits,
        misses: this.stats.resourceMisses,
        hitRate: this.stats.resourceHits / (this.stats.resourceHits + this.stats.resourceMisses) || 0,
        memoryUsage: 0,
      },
      total: {
        hits: this.stats.pageHits + this.stats.resourceHits,
        misses: this.stats.pageMisses + this.stats.resourceMisses,
      },
    };
  }

  resetStats(): void {
    this.stats = {
      pageHits: 0,
      pageMisses: 0,
      resourceHits: 0,
      resourceMisses: 0,
    };
  }

  // Получение размера кэша в байтах невозможно без Redis INFO, возвращаем 0
  async getCacheSize(): Promise<{ pages: number; resources: number; total: number }> {
    return { pages: 0, resources: 0, total: 0 };
  }
} 