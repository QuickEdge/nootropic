import winston from 'winston';
import { ConfigManager } from './config';

class Logger {
  private static instance: winston.Logger;

  static getInstance(): winston.Logger {
    if (!Logger.instance) {
      const config = ConfigManager.getInstance().getConfig();
      
      const logFormat = config.logging.format === 'json' 
        ? winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        : winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            })
          );

      Logger.instance = winston.createLogger({
        level: config.logging.level,
        format: logFormat,
        transports: [
          new winston.transports.Console({
            silent: !config.logging.enabled
          })
        ]
      });
    }

    return Logger.instance;
  }

  // Convenience methods for common logging patterns
  static info(message: string, meta?: any): void {
    Logger.getInstance().info(message, meta);
  }

  static error(message: string, meta?: any): void {
    Logger.getInstance().error(message, meta);
  }

  static warn(message: string, meta?: any): void {
    Logger.getInstance().warn(message, meta);
  }

  static debug(message: string, meta?: any): void {
    Logger.getInstance().debug(message, meta);
  }
}

export default Logger;