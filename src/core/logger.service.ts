import { Injectable, LoggerService } from '@nestjs/common';
import * as winston from 'winston';

const logDir = 'logs';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, context }) => {
      return `${timestamp} [${level.toUpperCase()}]${context ? ' [' + context + ']' : ''}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: `${logDir}/combined.log`, maxsize: 10485760, maxFiles: 5 }),
    new winston.transports.Console(),
  ],
});

@Injectable()
export class AppLogger implements LoggerService {
  log(message: string, context?: string) {
    logger.info(message, { context });
  }
  error(message: string, trace?: string, context?: string) {
    logger.error(`${message}${trace ? '\n' + trace : ''}`, { context });
  }
  warn(message: string, context?: string) {
    logger.warn(message, { context });
  }
  debug(message: string, context?: string) {
    logger.debug(message, { context });
  }
  verbose(message: string, context?: string) {
    logger.verbose(message, { context });
  }
} 