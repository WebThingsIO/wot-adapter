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
import { direct, multicast, DiscoveryOptions } from './discovery';
import Servient from '@node-wot/core';

const POLL_INTERVAL = 5 * 1000;

type WebThingEndpoint = { href: string; authentication: DiscoveryOptions['authentication'] };
// TODO: specify exact types for `any` (everywhere where possible)

export class WoTAdapter extends Adapter {
  private readonly knownUrls: any = {};

  private readonly savedDevices: Set<any> = new Set();

  public pollInterval: number = POLL_INTERVAL;

  private readonly discovery;

  constructor(manager: AddonManagerProxy,) {
    super(manager, manifest.id, manifest.id);

    this.discovery = multicast();
    this.discovery.on('thingUp', (data) => {
      this.addDevice(data.id, data);
    });
    this.discovery.on('thingDown', (data: string) => {
      this.unloadThing(data);
    });

    this.discovery.on('error', (e) => {
      console.warn(e);
    });

    this.discovery.start();

  }

  async unload(): Promise<void> {
    this.discovery.stop();
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
        await this.removeThing(this.getDevices()[id], true);
      }

      // TODO: Change arguments after implementing addDevice (if needed)
      await this.addDevice(id, href, options.authentication, thing, href);
    }
  }

  unloadThing(url: string): void {
    url = url.replace(/\/$/, '');

    for (const id in this.getDevices()) {
      const device = this.getDevices()[id];
      // TODO: Uncomment after implementing the device class
      // if (device.mdnsUrl === url) {
      //     device.closeWebSocket();
      //     this.removeThing(device, true);
      // }
    }

    if (this.knownUrls[url]) {
      delete this.knownUrls[url];
    }
  }

  // TODO: The method signature does not correspond to the one from the parent class
  //  (there is no `internal` parameter), that's why I've added the default value as a workaround for now
  removeThing(device: Device, internal = false) {
    return this.removeDeviceFromConfig(device).then(() => {
      if (!internal) {
        this.savedDevices.delete(device.getId());
      }

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

  async removeDeviceFromConfig(device: Device) {
    try {
      const db = new Database(this.getPackageName());
      await db.open();
      const config: any = await db.loadConfig();

      // If the device's URL is saved in the config, remove it.
      // TODO: Uncomment the following code after implementing the device class
      // const urlIndex = config.urls.indexOf(device.url);
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
  async addDevice(deviceId: string, td: any): Promise<Device> {
    if (deviceId in this.getDevices()) {
      throw new Error(`Device: ${deviceId} already exists.`);
    } else {
      // TODO: after instanciate a servient
      // const thing = await wot.consume(td);
      const device = new WoTDevice(this, deviceId, thing);
      this.handleDeviceAdded(device);
      return device;
    }
  }
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
