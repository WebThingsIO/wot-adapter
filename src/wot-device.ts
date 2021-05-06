import { WoTAdapter } from './wot-adapter';
import { Action, Device, Event, Property } from 'gateway-addon';
import * as schema from 'gateway-addon/lib/schema';
import { ConsumedThing } from 'wot-typescript-definitions';


export class WoTDevice extends Device {

  private readonly thing: ConsumedThing;

  public constructor(
    adapter: WoTAdapter,
    id: string,
    td: Record<string, unknown>,
    thing: ConsumedThing
  ) {
    super(adapter, id);

    // TODO: TD validation ?
    this.thing = thing;
    this.setTitle(td.title as string);
    this.setTypes(td['@type'] as string[] || []);
    this.setDescription(td.description as string);
    this.setContext('https://www.w3.org/2019/wot/td/v1');

    if(td.links) {
      const links = td.links as schema.Link[];
      for (const link of links) {
        this.addLink(link);
      }
    }

    if (td.properties) {
      const properties = td.properties as { [k: string]: schema.Property };
      for (const propertyName in properties) {
        const property = properties[propertyName];
        const deviceProperty = new Property(this, propertyName, property);
        this.addProperty(deviceProperty);
        this.observeProperty(td, deviceProperty);
      }
    }

    if(td.actions) {
      const actions = td.actions as { [k: string]: schema.Action};
      for (const actionName in actions) {
        const action = actions[actionName];
        this.addAction(actionName, action);
      }
    }

    if(td.events) {
      const events = td.events as { [k: string]: schema.Event };
      for (const eventName in events) {
        const event = events[eventName];
        this.addEvent(eventName, event);
        this.subscribeEvent(eventName);
      }
    }
  }

  public async performAction(action: Action): Promise<void> {
    // Note: currently invoking an Action is a syncronous operation.
    action.start();
    try {
      await this.thing.invokeAction(action.getName(), action.getInput);
      // TODO: correctly handle the output. WebThingAPI does not have action outputs
    } catch (error) {
      console.log(`Failed to perform action: ${error}`);
      // TODO: The status field is private and there is no setter for it
      // action.status = 'error';
      this.actionNotify(action);
    }finally{
      action.finish();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private observeProperty(td: Record<string, unknown>, property: Property<any>): void {
    if((td[property.getName()] as schema.Property).observable) {
      this.thing.observeProperty(property.getName(), (value) => {
        property.setCachedValueAndNotify(value);
      });
    }else{
      setInterval(async () => {
        const value = await this.thing.readProperty(property.getName());
        property.setCachedValueAndNotify(value);
      }, 5000); // TODO: add configuration parameter
    }
  }

  private subscribeEvent(eventName: string): void {
    this.thing.subscribeEvent(eventName, (data) => {
      this.eventNotify(new Event(this, eventName, data));
    });
  }
}
