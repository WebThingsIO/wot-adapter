import { expect } from 'chai';
import { Servient } from '@node-wot/core';
import { HttpServer } from '@node-wot/binding-http';
import { direct } from '../src/discovery';


describe('Discovery api tests', () => {
  it('fetch device directly', async () => {
    const servient = new Servient();
    servient.addServer(new HttpServer());
    const WoT = await servient.start();
    const thing = await WoT.produce({ title: 'non-cached-test-thing' });
    await thing.expose();
    const fetched = await direct('http://127.0.0.1:8080/non-cached-test-thing');
    // expect(false).to.be.true('fix me');
    // Compare TDs
    expect(thing.getThingDescription()).to.deep.eq(fetched[0]);
    // Make sure data is NOT from cache
    expect(fetched[1]).to.be.false;
    await servient.shutdown();
  });
  it('fetch device from cache (time-dependent)', async () => {
    const servient = new Servient();
    servient.addServer(new HttpServer());
    const WoT = await servient.start();
    const thing = await WoT.produce({ title: 'cached-test-thing' });
    await thing.expose();
    await direct('http://127.0.0.1:8080/cached-test-thing');
    const fetched = await direct('http://127.0.0.1:8080/cached-test-thing');
    // Compare TDs
    expect(thing.getThingDescription()).to.deep.eq(fetched[0]);
    // Make sure data is from cache
    expect(fetched[1]).to.be.true;
    await servient.shutdown();
  });
  it('fetch device from cache (data-dependent)', async () => {
    const servient = new Servient();
    servient.addServer(new HttpServer());
    const WoT = await servient.start();
    const thing = await WoT.produce({ title: 'cached-test-thing' });
    await thing.expose();
    await direct('http://127.0.0.1:8080/cached-test-thing');
    // Sleep for 6 seconds before next fetch
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const fetched = await direct('http://127.0.0.1:8080/cached-test-thing');
    // Compare TDs
    expect(thing.getThingDescription()).to.deep.eq(fetched[0]);
    // Make sure data is from cache
    expect(fetched[1]).to.be.true;
    await servient.shutdown();
  }).timeout(7000);
});

