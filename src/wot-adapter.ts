/**
 * WoT Adapter.ts
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { AddonManagerProxy, Adapter } from 'gateway-addon';
import manifest from '../manifest.json';

class WoTAdapter extends Adapter {
  constructor(manager: AddonManagerProxy) {
    super(manager, manifest.id, manifest.id);
  }

  async loadThing(url: string, retryCounter: number) {
    // TODO: See https://github.com/WebThingsIO/thing-url-adapter/blob/master/thing-url-adapter.js#L544
  }

  unloadThing(url: string) {
    // TODO: See https://github.com/WebThingsIO/thing-url-adapter/blob/master/thing-url-adapter.js#L635
  }
}

export default function loadWoTAdapter(manager: AddonManagerProxy) {
  // TODO: See https://github.com/WebThingsIO/thing-url-adapter/blob/master/thing-url-adapter.js#L844
}
