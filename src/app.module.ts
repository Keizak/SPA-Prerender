import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { CoreModule } from './core/core.module';
import { PrerenderModule } from './modules/prerender/prerender.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Throttling для защиты от DDoS
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    
    // Статические файлы для веб-интерфейса
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      exclude: ['/api*'],
    }),

    CoreModule,
    PrerenderModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {} 