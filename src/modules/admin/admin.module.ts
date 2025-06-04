import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PrerenderModule } from '../prerender/prerender.module';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [CoreModule, PrerenderModule],
  controllers: [AdminController],
})
export class AdminModule {} 