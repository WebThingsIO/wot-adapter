/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WoT Adapter.ts
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { AddonManagerProxy, Adapter, Device } from 'gateway-addon';
import manifest from '../manifest.json';
import WoTDevice from './wot-device';
import { direct, multicast, Discovery } from './discovery';
import Servient from '@node-wot/core';
import { WoTAdapterConfig, AuthenticationDataType } from './wot-adapter-config';
import { DeviceWithoutId as DeviceWithoutIdSchema } from 'gateway-addon/src/schema';
import { HttpClientFactory } from '@node-wot/binding-http';

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

  private savedDeviceIds: Set<string> = new Set();

  private continuos_discovery = false;

  private on_discovery = false;

  private on_pairing = false;

  private useObservable = false;

  async initDiscovery(): Promise<void> {
    if (this.on_discovery) {
      return;
    }
    if (
      this.continuos_discovery == true ||
      (this.continuos_discovery == false && this.on_pairing == true)
    ) {
      this.on_discovery = true;
      this.discovery = multicast();

      this.discovery.on('foundThing', (data: { url: string; td: Record<string, unknown> }) => {
        this.addDevice(data.url, data.td);
      });
      this.discovery.on('lostThing', (url: string) => {
        this.unloadThing(url);
      });
    }
  }

  terminateDiscovery(): void {
    if (this.on_discovery) {
      if (this.continuos_discovery == false && this.on_pairing == true) {
        this.discovery?.removeAllListeners('foundThing');
        this.discovery?.removeAllListeners('lostThing');
        this.discovery?.stop();
      }
    }
  }

  constructor(manager: AddonManagerProxy, configuration: WoTAdapterConfig) {
    super(manager, manifest.id, manifest.id);
    this.continuos_discovery = configuration.continuosDiscovery;
    this.useObservable = configuration.useObservable;
    manager.addAdapter(this);
  }

  async start(): Promise<void> {
    this.srv = new Servient();
    this.srv.addClientFactory(new HttpClientFactory());
    this.wot = await this.srv.start();

    this.continuos_discovery && (await this.initDiscovery());
  }

  async unload(): Promise<void> {
    for (const device of Object.values(this.getDevices())) {
      (device as WoTDevice).destroy();
    }

    this.srv && this.srv.shutdown();

    return super.unload();
  }

  async loadThing(
    url: string,
    retries?: number,
    retryInterval?: number,
    authdata: AuthenticationDataType = { schema: 'nosec' }
  ): Promise<void> {
    const href = url.replace(/\/$/, '');

    const [data, cached] = await direct(href, { retries, retryInterval, authentication: authdata });

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
      const device = await this.addDevice(href, thing, authdata);

      if (this.savedDeviceIds.has(device.getId())) {
        // The device was saved on adapter startup
        // we need to manually start it now.
        console.warn('Device', device.getId(), 'was previously saved. starting it now');
        (<WoTDevice>device).start();
      }
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

    if (this.getDevices()[device.getId()]) {
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
  async addDevice(
    url: string,
    td: Record<string, unknown>,
    authdata?: AuthenticationDataType
  ): Promise<Device> {
    if (!this.wot) {
      throw new Error('Unitilized device; call initDiscovery before adding a device');
    }
    if (this.getDevice(url)) {
      throw new Error(`Device: ${url} already exists.`);
    } else {
      const thing = await this.wot.consume(td);
      const device = new WoTDevice(this, url.replace(/[:/]/g, '-'), thing, {
        useObservable: this.useObservable,
      });

      // adds to current config

      const wcd: WoTAdapterConfig = new WoTAdapterConfig(manifest.id);
      await wcd.load();

      wcd.add({ url, authentication: authdata });
      await wcd.save();
      this.handleDeviceAdded(device);
      return device;
    }
  }

  handleDeviceSaved(_deviceId: string, _device: DeviceWithoutIdSchema): void {
    const device: WoTDevice = this.getDevice(_deviceId) as WoTDevice;
    if (!device) {
      // Sometime this method is called before we have loaded the device
      // we need to store the id so that we can start the device when
      // is fully loaded in the adapter
      console.warn('Device', _deviceId, 'has been saved before loading');
      this.savedDeviceIds.add(_deviceId);
      return;
    }

    device.start();
  }

  startPairing(_timeoutSeconds: number): void {
    // init discovery here
    if (this.continuos_discovery == false) {
      this.on_pairing = true;
      this.initDiscovery();
    }
  }

  cancelPairing(): void {
    // stop discovery here
    if (this.continuos_discovery == false && this.on_pairing == true) {
      this.terminateDiscovery();
      this.on_pairing = false;
    }
  }
}

export default async function loadWoTAdapter(manager: AddonManagerProxy): Promise<void> {
  try {
    const configuration: WoTAdapterConfig = new WoTAdapterConfig(manifest.id);
    await configuration.load();

    const adapter = new WoTAdapter(manager, configuration);
    await adapter.start();
    const retries = configuration.retries;
    const retryInterval = configuration.retryInterval;

    for (const s of configuration.urlList()) {
      const authentication = configuration.configData(s);
      await adapter.loadThing(s, retries, retryInterval, authentication);
    }
  } catch (error) {
    console.error(error);
  }
}
