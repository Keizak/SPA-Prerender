export interface AppConfig {
  server: ServerConfig;
  browser: BrowserConfig;
  cache: CacheConfig;
  performance: PerformanceConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface BrowserConfig {
  poolSize: number;
  options: {
    headless: boolean;
    args: string[];
  };
}

export interface CacheConfig {
  pages: {
    ttl: number;
    maxKeys: number;
    checkperiod: number;
  };
  resources: {
    maxSize: number;
  };
}

export interface PerformanceConfig {
  maxConcurrentRenders: number;
  renderTimeout: number;
  pageWaitTime: number;
}

export interface LoggingConfig {
  level: string;
  maxFiles: number;
  maxsize: number;
}

export interface SecurityConfig {
  allowedDomains: string[];
  maxUrlLength: number;
} 