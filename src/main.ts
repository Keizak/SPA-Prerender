import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppLogger } from './core/logger.service';
import * as basicAuth from 'express-basic-auth';

async function bootstrap() {
  const appLogger = new AppLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: appLogger,
  });

  // Безопасность
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        scriptSrc: ["'self'"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"]
      }
    }
  }));

  // Сжатие
  app.use(compression());

  // CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Глобальные пайпы валидации
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // Basic-Auth для дашборда
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASS;
  if (user && pass) {
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next(); // не защищаем API
      return basicAuth({
        users: { [user]: pass },
        challenge: true,
        realm: 'Prerender Dashboard',
      })(req, res, next);
    });
  }

  // Swagger документация
  const config = new DocumentBuilder()
    .setTitle('Prerender Service API')
    .setDescription('High-performance SPA prerender service с пулом браузеров и кэшированием')
    .setVersion('2.0.0')
    .addTag('Prerender', 'Операции пререндера')
    .addTag('Admin', 'Административные функции')
    .addTag('Health', 'Проверка состояния')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Получаем порт из переменных окружения или конфига
  const port = process.env.PORT || 3010;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);

  appLogger.log(`🚀 Prerender Service запущен на http://${host}:${port}`);
  appLogger.log(`📊 Веб-интерфейс: http://${host}:${port}`);
  appLogger.log(`📚 API документация: http://${host}:${port}/api/docs`);
  appLogger.log(`🔧 API: http://${host}:${port}/api/prerender?url=<URL>`);
}

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

bootstrap(); 