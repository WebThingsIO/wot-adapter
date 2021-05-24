/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WoT Adapter.ts
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { AddonManagerProxy, Adapter, Database, Device } from 'gateway-addon';
import manifest from '../manifest.json';
import * as crypto from 'crypto';
import WoTDevice from './wot-device';
import { direct, multicast, DiscoveryOptions, Discovery } from './discovery';
import Servient, { ConsumedThing } from '@node-wot/core';
import { Console } from 'node:console';


const POLL_INTERVAL = 5 * 1000;

type WebThingEndpoint = { href: string; authentication: DiscoveryOptions['authentication'] };
// TODO: specify exact types for `any` (everywhere where possible)

export class WoTAdapter extends Adapter {

  public pollInterval: number = POLL_INTERVAL;

  private __discovery!: Discovery;

  private __has_init = false;

  private __url2deviceids: Map<string, string> = new Map();

  // private __savedDevices: Map<string, Device>;

  // private __savedDevices: Map<string, Device>;

  private __srv!: Servient;

  private __wot!: WoT.WoT;


  public get discovery(): Discovery {
    return this.__discovery;
  }

  private stopDiscovery(): void {
    if (this.__has_init == true) {
      this.__discovery.stop();
      this.__has_init = false;
    }
  }

  public async initDiscovery(): Promise<void> {
    if (this.__has_init == false) {
      this.__discovery = multicast();
      this.__discovery.on('foundThing', (data: {
        url: string; td: Record<string, unknown>;}) => {
        this.addDevice(data.url, data.td);
      });
      this.__discovery.on('lostThing', (url: string) => {
        this.unloadThing(url);
      });

      this.__discovery.on('error', (e) => {
        console.warn(e);
      });

      this.__discovery.start();

      this.__srv = new Servient();
      this.__wot = await this.__srv.start();
      this.__has_init = true;
    }
  }

  constructor(manager: AddonManagerProxy,) {
    super(manager, manifest.id, manifest.id);
  }

  async unload(): Promise<void> {
    this.stopDiscovery();
    return super.unload();
  }

  async loadThing(url: string, options: DiscoveryOptions): Promise<void> {
    const href = url.replace(/\/$/, '');

    const [data, cached] = await direct(href, options);

    let things;
    if (Array.isArray(data)) {
      things = data;
    } else {
      things = [data];
    }

    for (const thing of things) {
      let id = thing.id;

      if (!id) {
        if (things.length > 1) {
          console.warn(
            `TD without id field is not allowed within a collection, skipping: ${thing.title}`
          );
          continue;
        }
        // We fallback to original URL if there is only one Thing
        id = href.replace(/[:/]/g, '-');
      }

      if (id in this.getDevices()) {
        if (cached) {
          continue;
        }
        await this.removeThing(this.getDevices()[id]);
      }

      // TODO: Change arguments after implementing addDevice (if needed)
      await this.addDevice(href, thing);
    }
  }

  unloadThing(url: string): void {
    const FN_NAME = 'WoTAdapter::unloadThing()';
    url = url.replace(/\/$/, '');

    let deviceId = '';
    if (this.__url2deviceids.has(url) == true) {
      deviceId = <string> this.__url2deviceids.get(url);
    }


    if (deviceId.length == 0) {
      logMsg(FN_NAME, `URL ${url} not found ! `);
      return;
    }


    const d: Device = this.getDevices()[deviceId];

    this.removeThing(d);
    this.__url2deviceids.delete(url);
  }

  // TODO: The method signature does not correspond to the one from the parent class
  //  (there is no `internal` parameter), that's why I've added the default value
  // as a workaround for now
  removeThing(device: Device): Promise<Device> {
    return this.removeDeviceFromConfig(device).then(() => {
      if (this.getDevices.hasOwnProperty(device.getId())) {
        this.handleDeviceRemoved(device);
        // TODO: Uncomment after implementing the device class
        // device.closeWebSocket();
        return device;
      } else {
        throw new Error(`Device: ${device.getId()} not found.`);
      }
    });
  }

  async removeDeviceFromConfig(device: Device): Promise<void> {
    try {
      const db = new Database(this.getPackageName());
      await db.open();
      const db_config: Record<string, unknown> = await db.loadConfig();

      // inverse

      // const urlIndex = db_config.urls.indexOf(device.url);
      // if (urlIndex >= 0) {
      //     config.urls.splice(urlIndex, 1);
      //     await db.saveConfig(config);
      //
      //     // Remove from list of known URLs as well.
      //     const adjustedUrl = device.url.replace(/\/$/, '');
      //     if (this.knownUrls.hasOwnProperty(adjustedUrl)) {
      //         delete this.knownUrls[adjustedUrl];
      //     }
      // }
    } catch (err) {
      console.error(`Failed to remove device ${device.getId()} from config: ${err}`);
    }
  }

  // TODO: Which parameters should we retain/add?
  async addDevice(url: string, td: Record<string, unknown>): Promise<Device> {
    if (this.__url2deviceids.has(url)) {
      throw new Error(`Device: ${url} already exists.`);
    } else {
      // TODO: after instanciate a servient
      // const thing = await WoT.consume(td);

      const thing = await this.__wot.consume(td);

      const device = new WoTDevice(this, url, thing);
      this.handleDeviceAdded(device);
      this.__url2deviceids.set(url, device.getId());
      return device;
    }
  }
}

function logMsg(caller: string, msg: string): void {
  const d: Date = new Date();
  let s: string = d.getFullYear().toString();
  s += '-';
  s += d.getMonth().toString().padStart(2, '0');
  s += '-';
  s += d.getDate().toString().padStart(2, '0');
  s += ' ';
  s += d.getHours().toString().padStart(2, '0');
  s += ':';
  s += d.getMinutes().toString().padStart(2, '0');
  s += ':';
  s += d.getSeconds().toString().padStart(2, '0');
  s += '.';
  s += d.getMilliseconds().toString().padStart(2, '0');

  s += ' ';
  s += caller;
  s += ' : ';
  s += msg;

  console.log(s);
}
export default async function loadWoTAdapter(manager: AddonManagerProxy): Promise<void> {
  try {
    const adapter = new WoTAdapter(manager);
    const db = new Database(manifest.id);
    await db.open();
    const configuration = await db.loadConfig();
    let retries: number | undefined;
    let retryInterval: number | undefined;

    if (typeof configuration.pollInterval === 'number') {
      adapter.pollInterval = configuration.pollInterval * 1000;
    }
    if (typeof configuration.retires === 'number') {
      retries = configuration.retries as number;
    }
    if (typeof configuration.retryInterval === 'number') {
      retryInterval = configuration.retryInterval * 1000;
    }

    // TODO: validate database entry
    const urls: Array<WebThingEndpoint> = configuration.urls as Array<WebThingEndpoint>;


    // Load already saved Web Things
    for (const url of urls) {
      await adapter.loadThing(url.href,
                              { retries,
                                retryInterval,
                                authentication: url.authentication });
    }
  } catch (error) {
    console.error(error);
  }
}
