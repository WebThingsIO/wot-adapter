import { WoTAdapter } from './wot-adapter';
import { Action, Device } from 'gateway-addon';
import { ConsumedThing, Servient } from '@node-wot/core';
import { HttpClientFactory, HttpsClientFactory } from '@node-wot/binding-http';
import WoTImpl from '@node-wot/core/dist/wot-impl';

export class WoTDevice extends Device {
  private readonly td: any;

  private static readonly servient: Servient = new Servient();

  private static servientStarted = false;

  private static thingFactory: any = null;

  private consumedThing: any = null;

  private requestedActions: any = new Map();

  public constructor(
    adapter: WoTAdapter,
    id: string,
    url: string,
    authentication: any,
    td: any,
    mdnsUrl: string
  ) {
    super(adapter, id);
    this.td = td;
    WoTDevice.initServient();
  }

  private static initServient(): void {
    if (!WoTDevice.servient.hasClientFor('http')) {
      WoTDevice.servient.addClientFactory(new HttpClientFactory());
    }

    if (!WoTDevice.servient.hasClientFor('https')) {
      WoTDevice.servient.addClientFactory(new HttpsClientFactory());
    }

    if (!WoTDevice.servientStarted) {
      WoTDevice.thingFactory = WoTDevice.servient.start();
      WoTDevice.servientStarted = true;
    }
  }

  public consumeThing(): Promise<WoTImpl> {
    return WoTDevice.thingFactory.then((tf: WoTImpl) => {
      this.consumedThing = tf.consume(this.td);
    });
  }

  public performAction(action: Action): Promise<void> {
    action.start();
    return this.consumedThing.then((ct: ConsumedThing) => {
      // TODO: uriVariables are not supported?
      ct.invokeAction(action.getName(), action.getInput(), undefined)
        .then((res) => {
          return res.json();
        })
        .then((res) => {
          this.requestedActions.set(res[action.getName()].href, action);
        })
        .catch((e) => {
          console.log(`Failed to perform action: ${e}`);
          // TODO: The status field is private and there is no setter for it
          // action.status = "error";
          this.actionNotify(action);
        });
    });
  }
}
