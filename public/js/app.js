class PrerenderDashboard {
    constructor() {
        this.autoRefreshInterval = null;
        this.isAutoRefreshing = false;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadStats();
        await this.loadHealth();
        this.setupAutoRefresh();
    }

    setupEventListeners() {
        // Tabs
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Logs
        document.getElementById('refreshLogs').addEventListener('click', () => {
            this.loadLogs();
        });

        document.getElementById('autoRefresh').addEventListener('click', () => {
            this.toggleAutoRefresh();
        });

        document.getElementById('logLimit').addEventListener('change', () => {
            this.loadLogs();
        });

        // Cache
        document.getElementById('clearAllCache').addEventListener('click', () => {
            this.clearCache('all');
        });

        document.getElementById('clearPagesCache').addEventListener('click', () => {
            this.clearCache('pages');
        });

        document.getElementById('clearResourcesCache').addEventListener('click', () => {
            this.clearCache('resources');
        });

        // Tools
        document.getElementById('testRender').addEventListener('click', () => {
            this.testRender();
        });

        document.getElementById('startWarmup').addEventListener('click', () => {
            this.startWarmup();
        });

        document.getElementById('resetStats').addEventListener('click', () => {
            this.resetStats();
        });

        document.getElementById('restartBrowsers').addEventListener('click', () => {
            this.restartBrowsers();
        });

        document.getElementById('startSitemapWarmup').addEventListener('click', () => {
            this.startSitemapWarmup();
        });
    }

    switchTab(tabName) {
        // Remove active class from all tabs and content
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Add active class to clicked tab and corresponding content
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName).classList.add('active');

        // Load specific content
        if (tabName === 'logs') {
            this.loadLogs();
        } else if (tabName === 'cache') {
            this.loadCacheDetails();
        }
    }

    async loadStats() {
        try {
            const response = await fetch('/api/admin/stats');
            const data = await response.json();

            // Render stats
            document.getElementById('totalRequests').textContent = data.render.total;
            document.getElementById('successfulRenders').textContent = data.render.successful;
            document.getElementById('errors').textContent = data.render.errors;
            document.getElementById('cacheHits').textContent = data.render.cacheHits;
            if (document.getElementById('activeRenders')) {
                document.getElementById('activeRenders').textContent = data.render.active;
            }
            if (document.getElementById('queuedRenders')) {
                document.getElementById('queuedRenders').textContent = data.render.queued;
            }

            // Browser stats
            document.getElementById('totalBrowsers').textContent = data.browser.total;
            document.getElementById('freeBrowsers').textContent = data.browser.free;
            document.getElementById('busyBrowsers').textContent = data.browser.busy;

            // System stats
            document.getElementById('memoryUsage').textContent = `${data.system.memory.heapUsed} MB`;
            document.getElementById('uptime').textContent = this.formatUptime(data.system.uptime);
            document.getElementById('nodeVersion').textContent = data.system.nodeVersion;

            // Cache stats
            document.getElementById('pagesInCache').textContent = data.cache.pages.keys;
            document.getElementById('resourcesInCache').textContent = data.cache.resources.keys;
            document.getElementById('cacheHitRate').textContent = 
                `${Math.round(data.cache.pages.hitRate * 100)}%`;

        } catch (error) {
            console.error('Ошибка загрузки статистики:', error);
        }
    }

    async loadHealth() {
        try {
            const response = await fetch('/api/admin/health');
            const data = await response.json();

            const indicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');

            // Remove all status classes
            indicator.className = 'status-indicator';
            
            // Add status class
            indicator.classList.add(data.status);

            // Update text
            statusText.textContent = data.status === 'healthy' ? 'Работает' : 
                                   data.status === 'degraded' ? 'Предупреждение' : 'Ошибка';

        } catch (error) {
            console.error('Ошибка загрузки статуса:', error);
            const indicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');
            indicator.className = 'status-indicator unhealthy';
            statusText.textContent = 'Недоступно';
        }
    }

    async loadLogs() {
        const limit = document.getElementById('logLimit').value;

        try {
            const response = await fetch(`/api/admin/logs?limit=${limit}`);
            const data = await response.json();

            const logsContent = document.getElementById('logsContent');
            
            if (data.logs.length === 0) {
                logsContent.innerHTML = '<div class="no-logs">Логи не найдены</div>';
                return;
            }

            const logsHtml = data.logs.map(log => `
                <div class="log-entry">
                    <div class="log-timestamp">${this.formatTimestamp(log.timestamp)}</div>
                    <div class="log-level ${log.level}">${log.level}</div>
                    <div class="log-message">${this.escapeHtml(log.message)}</div>
                </div>
            `).join('');

            logsContent.innerHTML = logsHtml;

        } catch (error) {
            console.error('Ошибка загрузки логов:', error);
            document.getElementById('logsContent').innerHTML = 
                '<div class="log-error">Ошибка загрузки логов</div>';
        }
    }

    async loadCacheDetails() {
        try {
            const response = await fetch('/api/admin/stats');
            const data = await response.json();

            const details = `Статистика кэша:

Страницы:
  Ключей: ${data.cache.pages.keys}
  Попаданий: ${data.cache.pages.hits}
  Промахов: ${data.cache.pages.misses}
  Процент попаданий: ${Math.round(data.cache.pages.hitRate * 100)}%
  Память: ${Math.round(data.cache.pages.memoryUsage / 1024)} KB

Ресурсы:
  Ключей: ${data.cache.resources.keys}
  Попаданий: ${data.cache.resources.hits}
  Промахов: ${data.cache.resources.misses}
  Процент попаданий: ${Math.round(data.cache.resources.hitRate * 100)}%
  Память: ${Math.round(data.cache.resources.memoryUsage / 1024)} KB

Общая статистика:
  Всего попаданий: ${data.cache.total.hits}
  Всего промахов: ${data.cache.total.misses}`;

            document.getElementById('cacheDetails').textContent = details;

        } catch (error) {
            console.error('Ошибка загрузки деталей кэша:', error);
            document.getElementById('cacheDetails').textContent = 'Ошибка загрузки данных';
        }
    }

    async clearCache(type) {
        const confirmMessage = type === 'all' ? 
            'Очистить весь кэш?' : 
            `Очистить кэш ${type === 'pages' ? 'страниц' : 'ресурсов'}?`;

        if (!confirm(confirmMessage)) return;

        try {
            const response = await fetch('/api/admin/cache/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type })
            });

            const data = await response.json();
            
            if (response.ok) {
                this.showNotification(`✅ ${data.message}`, 'success');
                await this.loadStats();
                await this.loadCacheDetails();
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка очистки кэша:', error);
            this.showNotification('❌ Ошибка очистки кэша', 'error');
        }
    }

    async testRender() {
        const url = document.getElementById('testUrl').value.trim();
        const resultDiv = document.getElementById('testResult');
        const button = document.getElementById('testRender');

        if (!url) {
            this.showTestResult('Введите URL для тестирования', 'error');
            return;
        }

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Тестирование...';

        try {
            const startTime = Date.now();
            const response = await fetch(`/api/prerender/render?url=${encodeURIComponent(url)}`);
            const duration = Date.now() - startTime;

            if (response.ok) {
                const cacheStatus = response.headers.get('X-Prerender-Cache');
                const serverDuration = response.headers.get('X-Prerender-Duration');
                
                this.showTestResult(
                    `✅ Успешно (${duration}ms)\nКэш: ${cacheStatus}\nДлительность сервера: ${serverDuration}ms`, 
                    'success'
                );
            } else {
                const error = await response.json();
                this.showTestResult(`❌ ${error.error}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка тестирования:', error);
            this.showTestResult(`❌ Ошибка: ${error.message}`, 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-play"></i> Протестировать';
        }
    }

    async startWarmup() {
        const urlsText = document.getElementById('warmupUrls').value.trim();
        const button = document.getElementById('startWarmup');

        if (!urlsText) {
            this.showWarmupResult('Введите URL для прогрева', 'error');
            return;
        }

        const urls = urlsText.split('\n').map(url => url.trim()).filter(url => url);

        if (urls.length === 0) {
            this.showWarmupResult('Введите корректные URL', 'error');
            return;
        }

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Прогрев...';

        try {
            const response = await fetch('/api/prerender/warmup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls })
            });

            const data = await response.json();

            if (response.ok) {
                this.showWarmupResult(`✅ ${data.message}`, 'success');
            } else {
                this.showWarmupResult(`❌ ${data.error}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка прогрева:', error);
            this.showWarmupResult(`❌ Ошибка: ${error.message}`, 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-rocket"></i> Запустить прогрев';
        }
    }

    async resetStats() {
        if (!confirm('Сбросить всю статистику?')) return;

        try {
            const response = await fetch('/api/admin/stats/reset', { method: 'POST' });
            const data = await response.json();

            if (response.ok) {
                this.showNotification(`✅ ${data.message}`, 'success');
                await this.loadStats();
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка сброса статистики:', error);
            this.showNotification('❌ Ошибка сброса статистики', 'error');
        }
    }

    async restartBrowsers() {
        if (!confirm('Перезапустить все браузеры? Активные рендеры будут прерваны.')) return;

        try {
            const response = await fetch('/api/admin/browsers/restart', { method: 'POST' });
            const data = await response.json();

            if (response.ok) {
                this.showNotification(`✅ ${data.message}`, 'success');
                await this.loadStats();
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка перезапуска браузеров:', error);
            this.showNotification('❌ Ошибка перезапуска браузеров', 'error');
        }
    }

    toggleAutoRefresh() {
        const button = document.getElementById('autoRefresh');
        
        if (this.isAutoRefreshing) {
            clearInterval(this.autoRefreshInterval);
            this.isAutoRefreshing = false;
            button.innerHTML = '<i class="fas fa-play"></i> Авто-обновление';
            button.classList.remove('auto-refresh-active');
        } else {
            this.autoRefreshInterval = setInterval(() => {
                if (document.querySelector('.tab-content.active').id === 'logs') {
                    this.loadLogs();
                }
            }, 5000);
            this.isAutoRefreshing = true;
            button.innerHTML = '<i class="fas fa-pause"></i> Остановить';
            button.classList.add('auto-refresh-active');
        }
    }

    setupAutoRefresh() {
        // Auto refresh stats every 10 seconds
        setInterval(() => {
            this.loadStats();
            this.loadHealth();
        }, 10000);
    }

    showTestResult(message, type) {
        const resultDiv = document.getElementById('testResult');
        resultDiv.textContent = message;
        resultDiv.className = `test-result ${type}`;
        resultDiv.style.display = 'block';
    }

    showWarmupResult(message, type) {
        const resultDiv = document.getElementById('warmupResult');
        resultDiv.textContent = message;
        resultDiv.className = `warmup-result ${type}`;
        resultDiv.style.display = 'block';
    }

    showNotification(message, type) {
        // Simple notification - you could implement a toast library here
        alert(message);
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'N/A';
        
        try {
            const date = new Date(timestamp);
            return date.toLocaleString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                day: '2-digit',
                month: '2-digit'
            });
        } catch (error) {
            return timestamp;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async startSitemapWarmup() {
        const url = document.getElementById('sitemapUrl').value.trim();
        const button = document.getElementById('startSitemapWarmup');
        if (!url) {
            this.showSitemapStatus('Введите ссылку на sitemap.xml', 'error');
            return;
        }
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Прогрев...';
        try {
            const response = await fetch(`/api/prerender/warmup-sitemap?sitemap=${encodeURIComponent(url)}`, { method: 'POST' });
            const data = await response.json();
            if (response.ok) {
                this.showSitemapStatus('Прогрев запущен. Статус будет обновляться автоматически.', 'success');
                this.pollSitemapStatus();
            } else {
                this.showSitemapStatus(data.error || 'Ошибка запуска прогрева', 'error');
            }
        } catch (error) {
            this.showSitemapStatus('Ошибка: ' + error.message, 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-rocket"></i> Запустить прогрев';
        }
    }

    async pollSitemapStatus() {
        const statusDiv = document.getElementById('sitemapWarmupStatus');
        const update = async () => {
            const response = await fetch('/api/prerender/warmup-status');
            const data = await response.json();
            statusDiv.innerHTML = `
                <b>В процессе:</b> ${data.inProgress ? 'Да' : 'Нет'}<br>
                <b>Всего:</b> ${data.total}<br>
                <b>Готово:</b> ${data.done}<br>
                <b>Ошибок:</b> ${data.errors}<br>
                <b>В очереди:</b> ${data.queue.length}<br>
                <b>Старт:</b> ${data.startedAt ? new Date(data.startedAt).toLocaleString() : '-'}<br>
                <b>Финиш:</b> ${data.finishedAt ? new Date(data.finishedAt).toLocaleString() : '-'}<br>
                <b>Последняя ошибка:</b> ${data.lastError || '-'}
            `;
            if (data.inProgress) {
                setTimeout(update, 5000);
            }
        };
        update();
    }

    showSitemapStatus(message, type) {
        const div = document.getElementById('sitemapWarmupStatus');
        div.textContent = message;
        div.className = `sitemap-status ${type}`;
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PrerenderDashboard();
}); 