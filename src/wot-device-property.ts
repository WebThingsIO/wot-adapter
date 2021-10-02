/**
 * wot-device-property.ts
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */
import { ConsumedThing } from 'wot-typescript-definitions';
import { Property } from 'gateway-addon';
import { Any, Property as PropertySchema } from 'gateway-addon/lib/schema';
import WoTDevice from './wot-device';

export class WoTDeviceProperty<T extends Any> extends Property<T> {
  private readonly _device: WoTDevice;

  public constructor(device: WoTDevice, name: string, propertyDescr: PropertySchema) {
    super(device, name, propertyDescr);
    this._device = device;
  }

  setValue(value: T): Promise<T> {
    const thing: ConsumedThing = this._device.thing;
    thing.writeProperty(this.getName(), value);
    return super.setValue(value);
  }

  getValue(): Promise<T> {
    const thing: ConsumedThing = this._device.thing;
    return thing.readProperty(this.getName());
  }
}
