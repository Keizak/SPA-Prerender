import { Injectable, BadRequestException } from '@nestjs/common';
import { Page, Browser } from 'puppeteer';
import { BrowserPoolService } from '../../core/browser-pool.service';
import { CacheService } from '../../core/cache.service';
import { AppConfigService } from '../../core/config.service';
import { PrerenderResult, PrerenderStats, WarmupStatus } from '../../common/interfaces/prerender.interface';
import { AppLogger } from '../../core/logger.service';
import axios from 'axios';
import * as xml2js from 'xml2js';

@Injectable()
export class PrerenderService {
  private readonly logger: AppLogger;
  private activeRenders = new Set<string>();
  private renderQueue: Array<() => void> = [];

  private stats = {
    totalRequests: 0,
    successfulRenders: 0,
    errors: 0,
    cacheHits: 0,
  };

  // Статус прогрева по sitemap
  private warmupStatus: WarmupStatus = {
    inProgress: false,
    total: 0,
    done: 0,
    errors: 0,
    queue: [],
  };

  private sitemapUrls: string[] = [];
  private autoWarmupInterval: NodeJS.Timeout | null = null;

  private lastTelegramProgress = 0;

  constructor(
    private readonly browserPoolService: BrowserPoolService,
    private readonly cacheService: CacheService,
    private readonly configService: AppConfigService,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger;
    // Автоматический прогрев при старте
    this.scheduleAutoWarmup();
  }

  async render(url: string, options: any = {}): Promise<PrerenderResult> {
    this.stats.totalRequests++;
    const startTime = Date.now();

    try {
      // Валидация URL
      this.validateUrl(url);

      // Проверка кэша
      const cacheKey = this.getCacheKey(url, options);
      const cached = await this.cacheService.getPage(cacheKey);

      if (cached) {
        this.stats.cacheHits++;
        this.logger.log(`Кэш попадание: ${url} (${Date.now() - startTime}ms)`);
        return { html: cached.html, fromCache: true };
      }

      // Ограничение параллельности
      await this.waitForSlot();

      return await this.performRender(url, options, startTime);
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Ошибка пререндера ${url}:`, error);
      throw error;
    }
  }

  async renderBatch(urls: string[]): Promise<Array<{ url: string; success: boolean; fromCache: boolean; duration: number; error?: string }>> {
    const promises = urls.map(url =>
      this.render(url).then(result => ({
        url,
        success: true,
        fromCache: result.fromCache,
        duration: result.duration || 0,
      })).catch(error => ({
        url,
        success: false,
        fromCache: false,
        duration: 0,
        error: error.message,
      }))
    );

    return Promise.all(promises);
  }

  async warmupCache(urls: string[]): Promise<void> {
    // Запускаем прогрев в фоне
    const warmupPromises = urls.map(url =>
      this.render(url).catch(error =>
        this.logger.warn(`Ошибка прогрева ${url}:`, error.message)
      )
    );

    // Не ждем завершения
    Promise.all(warmupPromises);
  }

  private async performRender(url: string, options: any, startTime: number): Promise<PrerenderResult> {
    let browser: Browser | null = null;
    let page: Page | null = null;
    const renderId = `${Date.now()}_${Math.random()}`;

    try {
      this.activeRenders.add(renderId);
      this.checkActiveRenders();

      browser = await this.browserPoolService.getBrowser();
      page = await browser.newPage();

      // Настройка страницы
      await this.setupPage(page);

      this.logger.log(`Начинаю пререндер: ${url}`);

      const performanceConfig = this.configService.performance;

      // Навигация с таймаутом
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: performanceConfig.renderTimeout,
      });

      // Дополнительное ожидание для полной загрузки
      await new Promise(r => setTimeout(r, performanceConfig.pageWaitTime))


      // Прокрутка для ленивой загрузки
      await this.autoScroll(page);

      // Удаляем счетчики и аналитику из DOM
      await page.evaluate(() => {
        // Удаляем все скрипты аналитики
        document.querySelectorAll('script[src*="google-analytics"],script[src*="googletagmanager"],script[src*="yandex"],script[src*="metrika"],script[src*="facebook"],script[src*="doubleclick"],script[src*="voiceflow"]').forEach(el => el.remove());
        // Удаляем все noscript с аналитикой
        document.querySelectorAll('noscript').forEach(el => {
          if (el.innerHTML.includes('mc.yandex.ru') || el.innerHTML.includes('google-analytics') || el.innerHTML.includes('facebook.com/tr')) {
            el.remove();
          }
        });
        // Удаляем img пиксели аналитики
        document.querySelectorAll('img[src*="mc.yandex.ru"],img[src*="google-analytics"],img[src*="facebook.com/tr"]').forEach(el => el.remove());
      });

      // Получение HTML
      const html = await page.content();

      // Сохранение в кэш
      const cacheKey = this.getCacheKey(url, options);
      await this.cacheService.setPage(cacheKey, html);

      const duration = Date.now() - startTime;
      this.stats.successfulRenders++;

      this.logger.log(`Пререндер завершен: ${url} (${duration}ms)`);

      return { html, fromCache: false, duration };
    } catch (error) {
      this.logger.error(`Ошибка в performRender для ${url}:`, error);

      // Перезапуск браузера при критической ошибке
      if (browser && error.message.includes('Protocol error')) {
        await this.browserPoolService.restartBrowser(browser);
        browser = null; // Предотвращаем освобождение
      }

      throw error;
    } finally {
      // Очистка ресурсов
      if (page) {
        try {
          await page.close();
        } catch (e) {
          this.logger.warn('Ошибка закрытия страницы:', e.message);
        }
      }

      if (browser) {
        this.browserPoolService.releaseBrowser(browser);
      }

      this.activeRenders.delete(renderId);
      this.processQueue();
      this.checkActiveRenders();
    }
  }

  private async setupPage(page: Page): Promise<void> {
    // User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );

    // Блокировка ненужных ресурсов для производительности и SEO
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      const resourceType = request.resourceType();
      // Блокируем аналитику, рекламу, пиксели, сторонние виджеты
      if (
        resourceType === 'font' ||
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook.com/tr') ||
        url.includes('doubleclick.net') ||
        url.includes('mc.yandex.ru') ||
        url.includes('metrika') ||
        url.includes('yandex.ru/watch') ||
        url.includes('tag.js') ||
        url.includes('voiceflow.com')
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Обработка ошибок страницы
    page.on('error', (error) => {
      this.logger.warn('Ошибка страницы:', error.message);
    });

    page.on('pageerror', (error) => {
      this.logger.warn('JavaScript ошибка на странице:', error.message);
    });
  }

  private async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  private validateUrl(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new BadRequestException('URL обязателен');
    }

    const securityConfig = this.configService.security;

    if (url.length > securityConfig.maxUrlLength) {
      throw new BadRequestException('URL слишком длинный');
    }

    try {
      const urlObj = new URL(url);

      // Проверка разрешенных доменов
      if (securityConfig.allowedDomains.length > 0) {
        if (!securityConfig.allowedDomains.includes(urlObj.hostname)) {
          throw new BadRequestException('Домен не разрешен');
        }
      }
    } catch (error) {
      throw new BadRequestException(`Невалидный URL: ${error.message}`);
    }
  }

  private getCacheKey(url: string, options: any): string {
    const optionsStr = JSON.stringify(options);
    return `${url}:${optionsStr}`;
  }

  private async waitForSlot(): Promise<void> {
    const performanceConfig = this.configService.performance;

    // Если есть свободные слоты, продолжаем
    if (this.activeRenders.size < performanceConfig.maxConcurrentRenders) {
      return;
    }

    // Иначе ждем в очереди
    return new Promise<void>((resolve) => {
      this.renderQueue.push(resolve);
    });
  }

  private processQueue(): void {
    const performanceConfig = this.configService.performance;

    // Обрабатываем очередь, если есть свободные слоты
    while (
      this.renderQueue.length > 0 &&
      this.activeRenders.size < performanceConfig.maxConcurrentRenders
    ) {
      const resolve = this.renderQueue.shift();
      if (resolve) {
        resolve();
      }
    }
  }

  async getStats(): Promise<PrerenderStats> {
    const browserStats = this.browserPoolService.getStats();
    const cacheStats = await this.cacheService.getStats();

    return {
      render: {
        total: this.stats.totalRequests,
        successful: this.stats.successfulRenders,
        errors: this.stats.errors,
        cacheHits: this.stats.cacheHits,
        active: this.activeRenders.size,
        queued: this.renderQueue.length,
      },
      browser: browserStats,
      cache: cacheStats,
    };
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRenders: 0,
      errors: 0,
      cacheHits: 0,
    };
    this.cacheService.resetStats();
  }

  // Прогрев кэша по sitemap.xml
  async warmupBySitemap(sitemapUrl: string): Promise<WarmupStatus> {
    if (this.warmupStatus.inProgress) {
      throw new BadRequestException('Прогрев уже запущен');
    }
    this.logger.log(`Загрузка sitemap: ${sitemapUrl}`);
    this.warmupStatus = {
      inProgress: true,
      total: 0,
      done: 0,
      errors: 0,
      queue: [],
      startedAt: Date.now(),
    };
    await this.sendTelegram('🚀 <b>Прогрев кэша по sitemap.xml начат</b>');
    try {
      const urls = await this.parseSitemap(sitemapUrl);
      this.sitemapUrls = urls;
      this.warmupStatus.total = urls.length;
      this.warmupStatus.queue = [...urls];
      this.logger.log(`Найдено ${urls.length} URL в sitemap.xml`);
      this.lastTelegramProgress = 0;
      for (const url of urls) {
        try {
          await this.render(url);
          this.warmupStatus.done++;
        } catch (e) {
          this.warmupStatus.errors++;
          this.warmupStatus.lastError = e.message;
          this.logger.warn(`Ошибка прогрева ${url}: ${e.message}`);
        }
        this.warmupStatus.queue.shift();
        // Telegram прогресс
        const percent = Math.floor((this.warmupStatus.done / this.warmupStatus.total) * 100);
        if (percent - this.lastTelegramProgress >= 10) {
          this.lastTelegramProgress = percent;
          await this.sendTelegram(`🔥 Прогрев кэша: <b>${percent}%</b> (${this.warmupStatus.done}/${this.warmupStatus.total})`);
        }
      }
      this.warmupStatus.inProgress = false;
      this.warmupStatus.finishedAt = Date.now();
      this.logger.log('Прогрев по sitemap завершён');
      await this.sendTelegram('✅ <b>Прогрев кэша завершён</b>');
    } catch (e) {
      this.warmupStatus.inProgress = false;
      this.warmupStatus.lastError = e.message;
      this.logger.error('Ошибка прогрева по sitemap:', e.message);
      await this.sendTelegram('❌ <b>Ошибка прогрева кэша:</b> ' + e.message);
    }
    return this.warmupStatus;
  }

  // Получить статус прогрева
  getWarmupStatus(): WarmupStatus {
    return this.warmupStatus;
  }

  // Парсинг sitemap.xml
  private async parseSitemap(sitemapUrl: string): Promise<string[]> {
    const res = await axios.get(sitemapUrl, { timeout: 15000 });
    const xml = res.data;
    const result = await xml2js.parseStringPromise(xml);
    const urls: string[] = [];
    if (result.urlset && result.urlset.url) {
      for (const u of result.urlset.url) {
        if (u.loc && u.loc[0]) urls.push(u.loc[0]);
      }
    }
    return urls;
  }

  // Автоматический прогрев по расписанию (каждый ttl/2 секунд)
  scheduleAutoWarmup() {
    if (this.autoWarmupInterval) clearInterval(this.autoWarmupInterval);

    // Безопасно получаем TTL
    let cacheTtl = 3600;
    if (
      this.cacheService &&
      this.cacheService['pageCache'] &&
      this.cacheService['pageCache'].options &&
      typeof this.cacheService['pageCache'].options.stdTTL === 'number'
    ) {
      cacheTtl = this.cacheService['pageCache'].options.stdTTL;
    }

    // Прогрев каждые ttl/2 секунд (например, если ttl=3600, то каждые 1800)
    const interval = Math.max(60, Math.floor(cacheTtl / 2));
    this.autoWarmupInterval = setInterval(async () => {
      if (this.sitemapUrls.length > 0 && !this.warmupStatus.inProgress) {
        this.logger.log('Автоматический прогрев кэша по sitemap...');
        await this.warmupBySitemap(this.sitemapUrls[0]); // sitemapUrls[0] — ссылка на sitemap.xml
      }
    }, interval * 1000);
  }

  private async sendTelegram(text: string) {
    const token = this.configService.telegramBotToken;
    const chatId = this.configService.telegramChatId;
    if (!token || !chatId) return;
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      });
    } catch (e) {
      this.logger.warn('Ошибка отправки Telegram:', e.message);
    }
  }

  // Уведомление о большом числе одновременных рендеров
  private notifyActiveRendersThreshold = 0;
  private readonly activeRendersThreshold = 7; // можно вынести в конфиг

  private checkActiveRenders() {
    if (this.activeRenders.size >= this.activeRendersThreshold && this.notifyActiveRendersThreshold !== this.activeRenders.size) {
      this.notifyActiveRendersThreshold = this.activeRenders.size;
      this.sendTelegram(`⚠️ <b>Внимание!</b> Одновременно активных рендеров: <b>${this.activeRenders.size}</b>`);
    }
    if (this.activeRenders.size < this.activeRendersThreshold) {
      this.notifyActiveRendersThreshold = 0;
    }
  }
} 