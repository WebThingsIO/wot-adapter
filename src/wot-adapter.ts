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
import { direct, multicast, DiscoveryOptions, Discovery, AuthenticationData } from './discovery';
import Servient, { ConsumedThing } from '@node-wot/core';
import { Console } from 'node:console';
import { WoTAdapterConfig } from './wot-adapter-config';
import { WoTAdapterConfigData } from './wot-adapter-config-data';
import { stringify } from 'node:querystring';


const POLL_INTERVAL = 5 * 1000;

type WebThingEndpoint = { href: string; authentication: DiscoveryOptions['authentication'] };
// TODO: specify exact types for `any` (everywhere where possible)

export class WoTAdapter extends Adapter {

  public pollInterval: number = POLL_INTERVAL;

  private __discovery!: Discovery;

  private __has_init = false;

  private __ref_count = 0;


  private __srv!: Servient;

  private __wot!: WoT.WoT;


  public get discovery(): Discovery {
    return this.__discovery;
  }

  private stopDiscovery(): void {
    if (this.__has_init == true) {
      --this.__ref_count;
      if (this.__ref_count == 0) {
        this.__discovery.stop();
        this.__has_init = false;
      }
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
    ++this.__ref_count;
  }

  constructor(manager: AddonManagerProxy,) {
    super(manager, manifest.id, manifest.id);
  }

  async unload(): Promise<void> {
    this.stopDiscovery();
    return super.unload();
  }

  async loadThing(
    url: string,
    retries?: number,
    retryInterval?: number,
    authdata?: AuthenticationData
  ): Promise<void> {
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

      // TODO: Change arguments after implementing addDevice (if needed)
      await this.addDevice(href, thing);
    }
  }

  unloadThing(url: string): void {
    const FN_NAME = 'WoTAdapter::unloadThing()';
    url = url.replace(/\/$/, '');

    const deviceId = url;

    if (deviceId.length == 0) {
      console.warn(FN_NAME, `URL ${url} not found ! `);
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
  async addDevice(
    url: string,
    td: Record<string, unknown>,
    authdata?: AuthenticationData
  ): Promise<Device> {
    if (this.getDevice(url)) {
      throw new Error(`Device: ${url} already exists.`);
    } else {
      // TODO: after instanciate a servient
      // const thing = await WoT.consume(td);

      const thing = await this.__wot.consume(td);
      const device = new WoTDevice(this, url, thing);
      this.handleDeviceAdded(device);

      // adds to current config

      const wcd: WoTAdapterConfig = new WoTAdapterConfig(manifest.id);
      await wcd.load();

      wcd.add(new WoTAdapterConfigData(url));
      await wcd.save();

      return device;
    }
  }
}


export default async function loadWoTAdapter(manager: AddonManagerProxy): Promise<void> {
  try {
    const adapter = new WoTAdapter(manager);

    const wcd: WoTAdapterConfig = new WoTAdapterConfig(manifest.id);
    await wcd.load();


    /*
    if (typeof configuration.pollInterval === 'number') {
      adapter.pollInterval = configuration.pollInterval * 1000;
    }
    if (typeof configuration.retries === 'number') {
      retries = configuration.retries as number;
    }
    if (typeof configuration.retryInterval === 'number') {
      retryInterval = configuration.retryInterval * 1000;
    }
*/
    // TODO: validate database entry
    // const urls: Array<WebThingEndpoint> = configuration.urls as Array<WebThingEndpoint>;

    const retries = wcd.retries;
    const retryInterval = wcd.retryInterval;

    for(const s in wcd.urlList) {
      const wt = wcd.configData(s);
      if (wt) {
        let dopts: DiscoveryOptions;

        if (wt.authData) {
          dopts = {
            retries,
            retryInterval,
            authentication: wt.authData,
          };
        }


        await adapter.loadThing(
          s,
          retries,
          retryInterval,
          wt.authData
        );
      }
    }
  } catch (error) {
    console.error(error);
  }
}
