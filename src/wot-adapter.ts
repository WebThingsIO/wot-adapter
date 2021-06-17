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
import { DeviceWithoutId as DeviceWithoutIdSchema } from '../node_modules/gateway-addon/src/schema';

const POLL_INTERVAL = 5 * 1000;

type WoTDiscoveredDeviceData = {
  td: Record<string, unknown>;
  authdata?: AuthenticationDataType;
};
// TODO: specify exact types for `any` (everywhere where possible)

export class WoTAdapter extends Adapter {

  public pollInterval: number = POLL_INTERVAL;

  private discovery?: Discovery;

  private srv?: Servient;

  private wot?: WoT.WoT;

  private __continuos_discovery = false;

  private __on_discovery = false;

  private __on_pairing = false;

  public set continuosDiscovery(b: boolean) {
    this.__continuos_discovery = b;
  }

  async initDiscovery(): Promise<void> {
    if (this.__on_discovery) {
      return;
    }
    if (
      this.__continuos_discovery == true ||
        (this.__continuos_discovery == false && this.__on_pairing == true)
    ) {
      this.__on_discovery = true;
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
  }

  terminateDiscovery(): void {
    if (this.__on_discovery) {
      if (this.__continuos_discovery == false && this.__on_pairing == true) {
        this.discovery?.removeAllListeners('foundThing');
        this.discovery?.removeAllListeners('lostThing');
        this.discovery && this.discovery.stop();
      }
    }
  }

  constructor(manager: AddonManagerProxy,) {
    super(manager, manifest.id, manifest.id);
  }

  async unload(): Promise<void> {
    for (const device of Object.values(this.getDevices())) {
      (device as WoTDevice).destroy();
    }

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
        await this.removeThing(this.getDevices()[id] as WoTDevice);
      }

      await this.addDevice(href, thing, authdata);
    }
  }

  async unloadThing(url: string): Promise<void> {
    url = url.replace(/\/$/, '');

    const deviceId = url;

    if (deviceId.length == 0) {
      console.warn('WoTAdapter::unloadThing()', `URL ${url} not found ! `);
      return;
    }

    const device = this.getDevices()[deviceId] as WoTDevice;

    this.removeThing(device);
  }

  async removeThing(device: WoTDevice): Promise<Device> {
    await this.removeDeviceFromConfig(device);

    if (this.getDevices.hasOwnProperty(device.getId())) {
      this.handleDeviceRemoved(device);
      device.destroy();
      return device;
    } else {
      throw new Error(`Device: ${device.getId()} not found.`);
    }
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

  /**
   * @method handleDeviceSaved
   *
   * Called to indicate that the user has saved a device to their gateway. This
   * is also called when the adapter starts up for every device which has
   * already been saved.
   *
   * This can be used for keeping track of what devices have previously been
   * discovered, such that the adapter can rebuild those, clean up old nodes,
   * etc.
   *
   * @param {string} deviceId - ID of the device
   * @param {object} device - the saved device description
   */
  handleDeviceSaved(_deviceId: string, _device: DeviceWithoutIdSchema): void {
    // pass
    const d: Device = this.getDevice(_deviceId);
    if (d) {
      const dd: WoTDevice = <WoTDevice>(d);
      dd.start();
    }
  }

  startPairing(_timeoutSeconds: number): void {
    // init discovery here
    if (this.__continuos_discovery == false) {
      this.__on_pairing = true;
      this.initDiscovery();
    }
  }

  cancelPairing(): void {
    // stop discovery here
    if (this.__continuos_discovery == false && this.__on_pairing == true) {
      this.terminateDiscovery();
      this.__on_pairing = false;
    }
  }
}


export default async function loadWoTAdapter(manager: AddonManagerProxy): Promise<void> {
  try {
    const adapter = new WoTAdapter(manager);

    const configuration: WoTAdapterConfig = new WoTAdapterConfig(manifest.id);
    await configuration.load();

    adapter.continuosDiscovery = configuration.continuosDiscovery;


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
