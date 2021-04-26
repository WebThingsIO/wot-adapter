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
import { WoTDevice } from './wot-device';

const POLL_INTERVAL = 5 * 1000;

type WebThingEndpoint = { href: string; authentication: any };
// TODO: specify exact types for `any` (everywhere where possible)

function getHeaders(authentication: any, includeContentType = false) {
  const headers: any = {
    Accept: 'application/json',
  };

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  switch (authentication.method) {
    case 'jwt':
      headers.Authorization = `Bearer ${authentication.token}`;
      break;
    case 'basic':
    case 'digest':
    default:
      // not implemented
      break;
  }

  return headers;
}

export class WoTAdapter extends Adapter {
  private readonly knownUrls: any = {};

  private readonly savedDevices: Set<any> = new Set();

  public pollInterval: number = POLL_INTERVAL;

  constructor(manager: AddonManagerProxy) {
    super(manager, manifest.id, manifest.id);
  }

  async loadThing(url: { href: string; authentication: any }, retryCounter = 0) {
    const href = url.href.replace(/\/$/, '');

    if (!this.knownUrls[href]) {
      this.knownUrls[href] = {
        href,
        authentication: url.authentication,
        digest: '',
        timestamp: 0,
      };
    }

    if (this.knownUrls[href].timestamp + 5000 > Date.now()) {
      return;
    }

    let res;
    try {
      res = await fetch(href, { headers: getHeaders(url.authentication) });
    } catch (e) {
      // Retry the connection at a 2 second interval up to 5 times.
      if (retryCounter >= 5) {
        console.log(`Failed to connect to ${href}: ${e}`);
      } else {
        setTimeout(() => this.loadThing(url, retryCounter + 1), 2000);
      }

      return;
    }

    const text = await res.text();

    const hash = crypto.createHash('md5');
    hash.update(text);
    const dig = hash.digest('hex');
    let known = false;
    if (this.knownUrls[href].digest === dig) {
      known = true;
    }

    this.knownUrls[href] = {
      href,
      authentication: url.authentication,
      digest: dig,
      timestamp: Date.now(),
    };

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log(`Failed to parse description at ${href}: ${e}`);
      return;
    }

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
        if (known) {
          continue;
        }
        await this.removeThing(this.getDevices()[id], true);
      }

      // TODO: Change arguments after implementing addDevice (if needed)
      await this.addDevice(id, href, url.authentication, thing, href);
    }
  }

  unloadThing(url: string) {
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
  addDevice(deviceId: string, deviceURL: string, authentication: any, td: any, mdnsUrl: string) {
    return new Promise(async (resolve, reject) => {
      if (deviceId in this.getDevices()) {
        reject(`Device: ${deviceId} already exists.`);
      } else {
        // TODO: Uncomment after implementing the device class (change the arguments as well)
        const device = new WoTDevice(this, deviceId, deviceURL, authentication, td, mdnsUrl);
        await device.consumeThing();
        // Promise.all(device.propertyPromises).then(() => {
        //     this.handleDeviceAdded(device);
        //
        //     if (this.savedDevices.has(deviceId)) {
        //         device.startReading(true);
        //     }
        //
        //     resolve(device);
        // }).catch((e) => reject(e));
      }
    });
  }
}

export default async function loadWoTAdapter(manager: AddonManagerProxy): Promise<void> {
  try {
    const adapter = new WoTAdapter(manager);
    const db = new Database(manifest.id);
    await db.open();
    const configuration = await db.loadConfig();

    if (typeof configuration.pollInterval === 'number') {
      adapter.pollInterval = configuration.pollInterval * 1000;
    }

    // TODO: validate database entry
    const urls: Array<WebThingEndpoint> = configuration.urls as Array<WebThingEndpoint>;

    // Load already saved Web Things
    for (const url of urls) {
      adapter.loadThing(url);
    }

    // Start discovery
    // TODO: call dns discovery
  } catch (error) {
    console.log(error);
  }
}
