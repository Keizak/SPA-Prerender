import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { Browser } from 'puppeteer';
import { AppConfigService } from './config.service';
import { BrowserStats } from '../common/interfaces/prerender.interface';

@Injectable()
export class BrowserPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private browsers: Browser[] = [];
  private freeBrowsers: Browser[] = [];
  private isInitialized = false;

  constructor(private readonly configService: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private async init(): Promise<void> {
    if (this.isInitialized) return;

    const browserConfig = this.configService.browser;
    this.logger.log(`Инициализация пула браузеров: ${browserConfig.poolSize} инстансов`);

    for (let i = 0; i < browserConfig.poolSize; i++) {
      try {
        const browser = await puppeteer.launch({
          headless: browserConfig.options.headless as any,
          args: browserConfig.options.args,
        });

        this.browsers.push(browser);
        this.freeBrowsers.push(browser);

        this.logger.log(`Браузер ${i + 1} инициализирован`);
      } catch (error) {
        this.logger.error(`Ошибка инициализации браузера ${i + 1}:`, error);
        throw error;
      }
    }

    this.isInitialized = true;
    this.logger.log('Пул браузеров готов к работе');
  }

  async getBrowser(): Promise<Browser> {
    if (!this.isInitialized) {
      await this.init();
    }

    // Ждем свободный браузер
    while (this.freeBrowsers.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const browser = this.freeBrowsers.pop();
    if (!browser) {
      throw new Error('Не удалось получить браузер из пула');
    }

    return browser;
  }

  releaseBrowser(browser: Browser): void {
    if (this.browsers.includes(browser)) {
      this.freeBrowsers.push(browser);
    }
  }

  async restartBrowser(browser: Browser): Promise<void> {
    try {
      const index = this.browsers.indexOf(browser);
      if (index === -1) return;

      this.logger.warn('Перезапуск браузера после ошибки');

      await browser.close();

      const browserConfig = this.configService.browser;
      const newBrowser = await puppeteer.launch({
        headless: browserConfig.options.headless as any,
        args: browserConfig.options.args,
      });

      this.browsers[index] = newBrowser;
      this.freeBrowsers.push(newBrowser);
    } catch (error) {
      this.logger.error('Ошибка перезапуска браузера:', error);
    }
  }

  async close(): Promise<void> {
    this.logger.log('Закрытие пула браузеров');

    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        this.logger.error('Ошибка закрытия браузера:', error);
      }
    }

    this.browsers = [];
    this.freeBrowsers = [];
    this.isInitialized = false;
  }

  getStats(): BrowserStats {
    return {
      total: this.browsers.length,
      free: this.freeBrowsers.length,
      busy: this.browsers.length - this.freeBrowsers.length,
    };
  }
} 