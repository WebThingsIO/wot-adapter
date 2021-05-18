/**
 * discovery.ts
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */
import EventEmitter from 'events';
import { ServiceType, Browser } from 'dnssd';
import * as crypto from 'crypto';
import fetch, { Response, HeadersInit } from 'node-fetch';

type CacheRecord = {
  href: string;
  authentication?: AuthenticationData;
  digest: string;
  td: Record<string, unknown>;
  timestamp: number;
};
// TODO: define a ThingDescription type
const tdsCache: Map<string, CacheRecord> = new Map();

type AuthenticationData = {
  schema: 'nosec'|'jwt' | 'basic' | 'digest';
  token?: string;
};
export type DiscoveryOptions = {
  retries?: number;
  retryInterval?: number;
  authentication: AuthenticationData;
};

export interface Discovery extends EventEmitter {
  start(): void;
  stop(): void;
}

function getHeaders(authentication: AuthenticationData, includeContentType = false): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/json',
  };

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  switch (authentication.schema) {
    case 'jwt':
      headers.Authorization = `Bearer ${authentication.token}`;
      break;
    case 'basic':
    case 'digest':
    default:
      break;
  }

  return headers;
}

class MDNSDiscovery extends EventEmitter implements Discovery {
  browser: Browser;

  constructor() {
    super();
    this.browser = new Browser(new ServiceType('_wot.tcp'));
    this.browser.on('serviceUp', async (service) => {
      const host = service.host.replace(/\.$/, '');
      let protocol = 'http';
      if (service.txt.hasOwnProperty('tls') && service.txt.tls === '1') {
        protocol = 'https';
      }
      try {
        const href = `${protocol}://${host}:${service.port}${service.txt.path}`;
        const td = await direct(href);
        this.emit('foundThing', { href, td });
      } catch (error) {
        this.emit('error', new Error(`Unreachable Thing: ${error}`));
      }
    });
    this.browser.on('serviceDown', (service) => {
      const host = service.host.replace(/\.$/, '');
      let protocol = 'http';
      if (service.txt.hasOwnProperty('tls') && service.txt.tls === '1') {
        protocol = 'https';
      }
      this.emit('lostThing', `${protocol}://${host}:${service.port}${service.txt.path}`);
    });
  }

  start(): void {
    this.browser.start();
  }

  stop(): void {
    this.browser.stop();
  }
}

async function fetchWithRetries(url: string, options: DiscoveryOptions = {
  retries: 5,
  retryInterval: 2000,
  authentication: {
    schema: 'nosec',
  },
}, retryCount = 0): Promise<Response> {
  try {
    return await fetch(url, { headers: getHeaders(options.authentication) });
  } catch (e) {
    // Retry the connection at a 2 second interval up to 5 times.
    if (retryCount >= options.retries!) {
      throw new Error(`Failed to connect to ${url}: ${e}`);
    } else {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          fetchWithRetries(url, options, ++retryCount).then(resolve).catch(reject);
        }, options.retryInterval);
      });
    }
  }
}

export async function direct(url: string, options?: DiscoveryOptions):
Promise<[Record<string, unknown>, boolean]> {
  const href = url.replace(/\/$/, '');

  if (!tdsCache.has(href)) {
    tdsCache.set(href, {
      href,
      authentication: options?.authentication,
      digest: '',
      td: {},
      timestamp: 0,
    });
  }
  if (tdsCache.get(href)!.timestamp + 5000 > Date.now()) {
    return [tdsCache.get(href)!.td, true];
  }

  const res = await fetchWithRetries(href, options);

  const text = await res.text();

  const hash = crypto.createHash('md5');
  hash.update(text);
  const dig = hash.digest('hex');

  if (tdsCache.get(href)?.digest === dig) {
    return [tdsCache.get(href)!.td, true];
  }


  try {
    const td = JSON.parse(text);

    tdsCache.set(href, {
      href,
      td,
      authentication: options?.authentication,
      digest: '',
      timestamp: Date.now(),
    });

    return [td, false];
  } catch (e) {
    throw new Error(`Failed to parse description at ${href}: ${e}`);
  }
}

export function multicast(): Discovery {
  return new MDNSDiscovery();
}
