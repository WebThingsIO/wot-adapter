/**
 * wot-device-property.ts
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */
import { ConsumedThing } from 'wot-typescript-definitions';
import { Property } from 'gateway-addon';
import * as schema from 'gateway-addon/lib/schema';
import * as WD from './wot-device';


export class WoTDeviceProperty<T extends schema.Any> extends Property<T> {
  private __dev: WD.default;

  public constructor(device: WD.default, name: string, propertyDescr: schema.Property) {
    super(device, name, propertyDescr);
    this.__dev = device;
  }

  setValue(value: T): Promise<T> {
    const c: ConsumedThing = this.__dev.getThing();
    c.writeProperty(this.getName(), value);
    return super.setValue(value);
  }

  getValue(): Promise<T> {
    const c: ConsumedThing = this.__dev.getThing();
    return c.readProperty(this.getName());
  }
};
