import { Injectable, Logger } from '@nestjs/common';
import * as NodeCache from 'node-cache';
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
  private pageCache: NodeCache;
  private resourceCache = new Map<string, CachedResource>();
  private maxResourceCacheSize: number;

  private stats = {
    pageHits: 0,
    pageMisses: 0,
    resourceHits: 0,
    resourceMisses: 0,
  };

  constructor(private readonly configService: AppConfigService) {
    const cacheConfig = this.configService.cache;

    // LRU кэш для страниц (node-cache)
    this.pageCache = new NodeCache({
      stdTTL: cacheConfig.pages.ttl,
      maxKeys: cacheConfig.pages.maxKeys,
      checkperiod: cacheConfig.pages.checkperiod,
      useClones: false,
    });

    this.maxResourceCacheSize = cacheConfig.resources.maxSize;

    // События кэша страниц
    this.pageCache.on('expired', (key) => {
      this.logger.debug(`Страница истекла из кэша: ${key}`);
    });

    this.pageCache.on('del', (key) => {
      this.logger.debug(`Страница удалена из кэша: ${key}`);
    });
  }

  // Кэш страниц
  getPage(url: string): CachedPage | null {
    const cached = this.pageCache.get<CachedPage>(url);
    if (cached) {
      this.stats.pageHits++;
      this.logger.debug(`Кэш попадание (страница): ${url}`);
      return cached;
    }
    this.stats.pageMisses++;
    this.logger.debug(`Кэш промах (страница): ${url}`);
    return null;
  }

  setPage(url: string, html: string): void {
    const ttl = this.pageCache.options.stdTTL || 3600;
    const cached: CachedPage = {
      html,
      timestamp: Date.now(),
      size: Buffer.byteLength(html, 'utf8'),
      createdAt: Date.now(),
      ttl,
    };
    this.pageCache.set(url, cached, ttl);
    this.logger.debug(`Страница сохранена в кэш: ${url}`);
  }

  deletePage(url: string): void {
    this.pageCache.del(url);
    this.logger.debug(`Страница удалена из кэша: ${url}`);
  }

  // Получить TTL и время жизни страницы
  getPageCacheInfo(url: string): { exists: boolean; createdAt?: number; expiresAt?: number; ttl?: number; remaining?: number } {
    const cached = this.pageCache.get<CachedPage>(url);
    if (!cached) return { exists: false };
    const ttl = cached.ttl;
    const createdAt = cached.createdAt;
    const expiresAt = createdAt + ttl * 1000;
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    return { exists: true, createdAt, expiresAt, ttl, remaining };
  }

  // Кэш ресурсов
  getResource(url: string): CachedResource | null {
    if (this.resourceCache.has(url)) {
      this.stats.resourceHits++;
      this.logger.debug(`Кэш попадание (ресурс): ${url}`);
      return this.resourceCache.get(url)!;
    }
    this.stats.resourceMisses++;
    this.logger.debug(`Кэш промах (ресурс): ${url}`);
    return null;
  }

  setResource(url: string, data: any): void {
    // Проверяем лимит размера кэша ресурсов
    if (this.resourceCache.size >= this.maxResourceCacheSize) {
      // Удаляем самый старый элемент (FIFO)
      const firstKey = this.resourceCache.keys().next().value;
      this.resourceCache.delete(firstKey);
      this.logger.debug(`Удален старый ресурс из кэша: ${firstKey}`);
    }

    const cached: CachedResource = {
      data,
      timestamp: Date.now(),
      size: Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, 'utf8'),
    };

    this.resourceCache.set(url, cached);
    this.logger.debug(`Ресурс сохранен в кэш: ${url}`);
  }

  // Очистка кэшей
  clearPageCache(): void {
    this.pageCache.flushAll();
    this.logger.log('Кэш страниц очищен');
  }

  clearResourceCache(): void {
    this.resourceCache.clear();
    this.logger.log('Кэш ресурсов очищен');
  }

  clearAll(): void {
    this.clearPageCache();
    this.clearResourceCache();
    this.resetStats();
    this.logger.log('Все кэши очищены');
  }

  // Статистика
  getStats(): CacheStats {
    const pageStats = this.pageCache.getStats();
    const resourceCacheSize = this.resourceCache.size;
    const resourceMemoryUsage = Array.from(this.resourceCache.values())
      .reduce((total, item) => total + item.size, 0);

    return {
      pages: {
        keys: pageStats.keys,
        hits: this.stats.pageHits,
        misses: this.stats.pageMisses,
        hitRate: this.stats.pageHits / (this.stats.pageHits + this.stats.pageMisses) || 0,
        memoryUsage: pageStats.vsize,
      },
      resources: {
        keys: resourceCacheSize,
        hits: this.stats.resourceHits,
        misses: this.stats.resourceMisses,
        hitRate: this.stats.resourceHits / (this.stats.resourceHits + this.stats.resourceMisses) || 0,
        memoryUsage: resourceMemoryUsage,
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

  // Получение размера кэша в байтах
  getCacheSize(): { pages: number; resources: number; total: number } {
    const pageStats = this.pageCache.getStats();
    const resourceMemoryUsage = Array.from(this.resourceCache.values())
      .reduce((total, item) => total + item.size, 0);

    return {
      pages: pageStats.vsize,
      resources: resourceMemoryUsage,
      total: pageStats.vsize + resourceMemoryUsage,
    };
  }
} 