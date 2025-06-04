import { Module } from '@nestjs/common';
import { PrerenderController } from './prerender.controller';
import { PrerenderService } from './prerender.service';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [CoreModule],
  controllers: [PrerenderController],
  providers: [PrerenderService],
  exports: [PrerenderService],
})
export class PrerenderModule {} 