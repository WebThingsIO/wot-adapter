import chai, { expect } from 'chai';
import WoTDevice from '../src/wot-device';
import { stubInterface } from 'ts-sinon';
import { ConsumedThing } from '@node-wot/core';
import { WoTAdapter } from '../src/wot-adapter';
import sinon, { fake, SinonStub, spy } from 'sinon';
import { AddonManagerProxy, Event } from 'gateway-addon';
import sinonChai from 'sinon-chai';

chai.use(sinonChai);

describe('WoT Device tests', () => {
  let testDevice: WoTDevice;

  const mockConsumedThing = stubInterface<ConsumedThing>();
  const mockAdapter = stubInterface<WoTAdapter>();
  const mockManager = stubInterface<AddonManagerProxy>();


  beforeEach(() => {
    mockAdapter.getManager.returns(mockManager);
  });

  afterEach(() => {
    sinon.reset();
    testDevice && testDevice.destroy();
  });

  it('Should write property', () => {
    const td = {
      properties: {
        test: {
          type: 'number',
        },
      },
    };
    mockConsumedThing.getThingDescription.returns(td);
    testDevice = new WoTDevice(mockAdapter, 'test', mockConsumedThing);
    testDevice.setProperty('test', 1);
    expect(mockConsumedThing.writeProperty).calledOnceWith('test', 1);
    testDevice.destroy();
  });

  it('Should read property', async () => {
    const td = {
      properties: {
        test: {
          type: 'number',
        },
      },
    };
    mockConsumedThing.getThingDescription.returns(td);
    testDevice = new WoTDevice(mockAdapter, 'test', mockConsumedThing);
    mockConsumedThing.readProperty.returns(Promise.resolve(1));
    const value = await testDevice.getProperty('test');

    expect(value).be.eqls(1);
    expect(mockConsumedThing.readProperty).calledOnceWith('test');
  });

  it('Should invoke an action', async () => {
    const td = {
      actions: {
        test: {
          input: {
            type: 'number',
          },
        },
      },
    };
    mockConsumedThing.getThingDescription.returns(td);
    testDevice = new WoTDevice(mockAdapter, 'test', mockConsumedThing);
    await testDevice.requestAction('1234', 'test', 1);

    expect(mockConsumedThing.invokeAction).calledOnceWith('test', 1);
  });

  it('Should fire events', async () => {
    const td = {
      events: {
        test: {
          type: 'number',
        },
      },
    };
    let eventCallback: WoT.WotListener;
    const subscribe: SinonStub<[name: string,
      listener: WoT.WotListener,
      options?: WoT.InteractionOptions | undefined],
    Promise<void>> = fake((event: string, callback: WoT.WotListener) => {
      eventCallback = callback;
    }) as SinonStub<[name: string,
      listener: WoT.WotListener, options?:
      WoT.InteractionOptions | undefined], Promise < void>>;

    mockConsumedThing.subscribeEvent = subscribe;
    mockConsumedThing.getThingDescription.returns(td);
    testDevice = new WoTDevice(mockAdapter, 'test', mockConsumedThing);
    const eventNotifySpy = spy(testDevice, 'eventNotify');

    eventCallback!(1);

    expect(eventNotifySpy).calledOnceWith(new Event(testDevice, 'test', 1));

    expect(mockConsumedThing.subscribeEvent).calledOnceWith('test');
  });
});
