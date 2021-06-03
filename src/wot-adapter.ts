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
import WoTDevice from './wot-device';
import { direct, multicast, DiscoveryOptions, Discovery } from './discovery';
import Servient from '@node-wot/core';
import { WoTAdapterConfig, AuthenticationDataType } from './wot-adapter-config';


const POLL_INTERVAL = 5 * 1000;

// TODO: specify exact types for `any` (everywhere where possible)

export class WoTAdapter extends Adapter {

  public pollInterval: number = POLL_INTERVAL;

  private discovery?: Discovery;

  private srv?: Servient;

  private wot?: WoT.WoT;


  async initDiscovery(): Promise<void> {
    this.discovery = multicast();
    this.discovery.on('foundThing', (data: {
      url: string; td: Record<string, unknown>;}) => {
      this.addDevice(data.url, data.td);
    });
    this.discovery.on('lostThing', (url: string) => {
      this.unloadThing(url);
    });

    this.srv = new Servient();
    this.wot = await this.srv.start();
  }

  constructor(manager: AddonManagerProxy,) {
    super(manager, manifest.id, manifest.id);
  }

  async unload(): Promise<void> {
    this.discovery && this.discovery.stop();
    this.srv && this.srv.shutdown();

    return super.unload();
  }

  async loadThing(url: string, retries?: number, retryInterval?: number,
                  authdata?: AuthenticationDataType): Promise<void> {
    const href = url.replace(/\/$/, '');

    let v: [Record<string, unknown>, boolean];

    if (authdata) {
      const dopts: DiscoveryOptions = {
        retries,
        retryInterval,
        authentication: authdata,
      };

      v = await direct(href, dopts);
    } else {
      v = await direct(href);
    }

    const [data, cached] = v;

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

      await this.addDevice(href, thing, authdata);
    }
  }

  unloadThing(url: string): void {
    url = url.replace(/\/$/, '');

    const deviceId = url;

    if (deviceId.length == 0) {
      console.warn('WoTAdapter::unloadThing()', `URL ${url} not found ! `);
      return;
    }


    const d: Device = this.getDevices()[deviceId];

    this.removeThing(d);
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
      const wcd: WoTAdapterConfig = new WoTAdapterConfig(manifest.id);
      await wcd.load();
      wcd.remove(device.getId());
      await wcd.save();
    } catch (err) {
      console.error(`Failed to remove device ${device.getId()} from config: ${err}`);
    }
  }

  // TODO: Which parameters should we retain/add?
  async addDevice(url: string, td: Record<string, unknown>, authdata?: AuthenticationDataType):
  Promise<Device> {
    if (!this.wot) {
      throw new Error('Unitilized device; call initDiscovery before adding a device');
    }
    if (this.getDevice(url)) {
      throw new Error(`Device: ${url} already exists.`);
    } else {
      const thing = await this.wot.consume(td);
      const device = new WoTDevice(this, url, thing);
      this.handleDeviceAdded(device);

      // adds to current config

      const wcd: WoTAdapterConfig = new WoTAdapterConfig(manifest.id);
      await wcd.load();

      wcd.add({ url, authentication: authdata });
      await wcd.save();

      return device;
    }
  }
}


export default async function loadWoTAdapter(manager: AddonManagerProxy): Promise<void> {
  try {
    const adapter = new WoTAdapter(manager);

    const configuration: WoTAdapterConfig = new WoTAdapterConfig(manifest.id);
    await configuration.load();

    const retries = configuration.retries;
    const retryInterval = configuration.retryInterval;

    await adapter.initDiscovery();

    for(const s in configuration.urlList) {
      const authentication = configuration.configData(s);
      await adapter.loadThing(
        s,
        retries,
        retryInterval,
        authentication
      );
    }
  } catch (error) {
    console.error(error);
  }
}
