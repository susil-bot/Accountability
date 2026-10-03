import { Global, Inject, Module, OnModuleInit } from '@nestjs/common';
import * as path from 'node:path';
import { APP_CONFIG, AppConfig } from '../config/env';
import { LocalStorageDriver } from './local-storage.driver';
import { R2StorageDriver } from './r2-storage.driver';
import { S3ProxyStorageDriver } from './s3-proxy-storage.driver';
import { ProxiedStorageDriver } from './proxied-storage.driver';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';
import { StorageController } from './storage.controller';

@Global()
@Module({
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig): StorageDriver => {
        if (cfg.storageDriver === 'r2' && cfg.r2) return new R2StorageDriver(cfg.r2);
        if (cfg.storageDriver === 's3' && cfg.s3) return new S3ProxyStorageDriver(cfg.s3, cfg.storageSigningSecret);
        return new LocalStorageDriver(path.resolve(cfg.storageLocalDir), cfg.storageSigningSecret);
      },
    },
  ],
  exports: [STORAGE_DRIVER],
})
export class StorageModule implements OnModuleInit {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  async onModuleInit() {
    if (this.driver instanceof ProxiedStorageDriver) await this.driver.init();
  }
}
