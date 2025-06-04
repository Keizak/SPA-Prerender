export interface PrerenderResult {
  html: string;
  fromCache: boolean;
  duration?: number;
}

export interface BrowserStats {
  total: number;
  free: number;
  busy: number;
}

export interface CacheStats {
  pages: {
    keys: number;
    hits: number;
    misses: number;
    hitRate: number;
    memoryUsage: number;
  };
  resources: {
    keys: number;
    hits: number;
    misses: number;
    hitRate: number;
    memoryUsage: number;
  };
  total: {
    hits: number;
    misses: number;
  };
}

export interface SystemStats {
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  uptime: number;
  nodeVersion: string;
  platform: string;
}

export interface PrerenderStats {
  render: {
    total: number;
    successful: number;
    errors: number;
    cacheHits: number;
    active: number;
    queued: number;
  };
  browser: BrowserStats;
  cache: CacheStats;
  system?: SystemStats;
  timestamp?: string;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    [key: string]: {
      status: 'ok' | 'warning' | 'error';
      message: string;
    };
  };
  timestamp: string;
  uptime?: number;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface WarmupStatus {
  inProgress: boolean;
  total: number;
  done: number;
  errors: number;
  queue: string[];
  startedAt?: number;
  finishedAt?: number;
  lastError?: string;
} 