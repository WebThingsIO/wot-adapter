import { Database } from 'gateway-addon';
import { DiscoveryOptions } from './discovery';

import { WoTAdapterConfigData } from './wot-adapter-config-data';

export class WoTAdapterConfig {
  private __db: Database;

  private __device_data: Map<string, WoTAdapterConfigData> = new Map();

  private __pollInterval = 1;

  private __retries = 3;

  private __retryInterval = 10;

  public get pollInterval(): number {
    return this.__pollInterval;
  }

  public get retries(): number {
    return this.__retries;
  }

  public get retryInterval(): number {
    return this.__retryInterval;
  }


  public constructor(name: string, path?: string) {
    this.__db = new Database(name, path);
  }

  public async load(): Promise<void> {
    // open db
    await this.__db.open();
    const db_config: Record<string, unknown> = await this.__db.loadConfig();

    for(const k in db_config) {
      const url = <string> k;
      this.__device_data.set(url, new WoTAdapterConfigData(
        url,
        <DiscoveryOptions['authentication']> db_config[url]
      )
      );
    }

    // loads data into
  }

  public async save(): Promise<void> {
    await this.__db.open();
    const newObject: Record<string, unknown> = {};

    for (const [key, value] of this.__device_data) {
      newObject[key] = value;
    }

    // console.log(JSON.stringify(newObject));

    await this.__db.saveConfig(newObject);
  }

  public add(d: WoTAdapterConfigData): void {
    this.__device_data.set(d.url, d);
    this.save();
  }

  public remove(url: string): void {
    this.__device_data.delete(url);
    this.save();
  }

  public urlList(): IterableIterator<string> {
    return this.__device_data.keys();
  }

  public configData(url: string): WoTAdapterConfigData | undefined {
    return this.__device_data.get(url);
  }


}
