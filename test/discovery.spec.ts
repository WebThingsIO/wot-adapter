import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Servient } from '@node-wot/core';
import { HttpServer } from '@node-wot/binding-http';
import { direct, multicast } from '../src/discovery';
import { Advertisement, ServiceType } from 'dnssd';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('Discovery api tests', () => {
  let servient: Servient;
  before(() => {
    // disable servient logs
    const logger = (...args: any[]): void => {
      if (!args[0] || !args[0]?.startsWith('[')) {
        console.log(args);
      }
    };
    console.warn = logger;
    console.info = logger;
    console.debug = logger;
  });
  beforeEach(() => {
    servient = new Servient();
  });
  it('fetch device directly', async () => {
    servient.addServer(new HttpServer());
    const WoT = await servient.start();
    const thing = await WoT.produce({ title: 'non-cached-test-thing', id: 'test' });
    await thing.expose();
    const fetched = await direct('http://127.0.0.1:8080/non-cached-test-thing');
    // Compare TDs
    expect(thing.getThingDescription()).to.deep.eq(fetched[0]);
    // Make sure data is NOT from cache
    expect(fetched[1]).to.be.false;
  });
  it('invalid url should throw an error', async () => {
    servient.addServer(new HttpServer());
    const WoT = await servient.start();
    const thing = await WoT.produce({ title: 'test-thing', id: 'test' });
    await thing.expose();
    await expect(direct('http://127.0.0.1:8080/invalidurl')).to.be.rejectedWith(Error);
  });
  it('fetch device from cache (time-dependent)', async () => {
    servient.addServer(new HttpServer());
    const WoT = await servient.start();
    const thing = await WoT.produce({ title: 'cached-test-thing', id: 'test' });
    await thing.expose();
    await direct('http://127.0.0.1:8080/cached-test-thing');
    const fetched = await direct('http://127.0.0.1:8080/cached-test-thing');
    // Compare TDs
    expect(thing.getThingDescription()).to.deep.eq(fetched[0]);
    // Make sure data is from cache
    expect(fetched[1]).to.be.true;
  });
  it('fetch device from cache (data-dependent)', async () => {
    servient.addServer(new HttpServer());
    const WoT = await servient.start();
    const thing = await WoT.produce({ title: 'cached-test-thing', id: 'test' });
    await thing.expose();
    await direct('http://127.0.0.1:8080/cached-test-thing');
    // Sleep for 6 seconds before next fetch
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const fetched = await direct('http://127.0.0.1:8080/cached-test-thing');
    // Compare TDs
    expect(thing.getThingDescription()).to.deep.eq(fetched[0]);
    // Make sure data is from cache
    expect(fetched[1]).to.be.true;
  }).timeout(7000);
  describe('Multicast', () => {
    it('multicast thing discovery - foundThing', (done) => {
      (async () => {
        servient.addServer(new HttpServer());
        const WoT = await servient.start();
        // Produce and expose the test Thing
        const thing = await WoT.produce({ title: 'multicast-test-thing-found', id: 'test' });
        await thing.expose();
        // Get an instance of MDNSDiscovery
        const discovery = multicast();
        // Add a handler to check for the right event
        discovery.on('foundThing', async (data) => {
          // Clean up everything
          servient.shutdown();
          discovery.stop();
          ad.stop();
          // Sleep for 2 seconds - otherwise interferes with the next test
          // TODO: Can the interference be resolved without sleeping?
          await new Promise((resolve) => setTimeout(resolve, 2000));
          // Compare TDs
          expect(thing.getThingDescription()).to.deep.eq(data.td[0]);
          // Since `expect` is inside callback, we need `done` in the end
          done();
        });
        discovery.on('error', (e) => done(e));
        discovery.start();
        // Create and start the service to advertise the Thing
        const ad = new Advertisement(
          new ServiceType('_wot.tcp'),
          8080,
          { txt: { path: '/multicast-test-thing-found' } }
        );
        ad.start();
      })();
    }).timeout(6000);
    it('multicast thing discovery - lostThing', (done) => {
      (async () => {
        servient.addServer(new HttpServer());
        const WoT = await servient.start();
        // Produce and expose the test Thing
        const thing = await WoT.produce({ title: 'multicast-test-thing-lost', id: 'test' });
        await thing.expose();
        // Get an instance of MDNSDiscovery
        const discovery = multicast();
        // Create the service to advertise the Thing
        const ad = new Advertisement(
          new ServiceType('_wot.tcp'),
          8080,
          { txt: { path: '/multicast-test-thing-lost' } }
        );
        // Immediately stop advertising when the Thing is found
        discovery.on('foundThing', () => {
          ad.stop();
        });
        // Add a handler to check for the right event
        discovery.on('lostThing', (url) => {
          // Clean up everything
          discovery.stop();
          // Compare URLs
          // TODO: construct URL without ts-ignore
          // @ts-ignore
          // noinspection HttpUrlsUsage
          const URL = `http://${ad.hostname}.${ad._domain}:${ad.port}${ad.txt.path}`;
          expect(URL).to.eq(url);
          // Since `expect` is inside callback, we need `done` in the end
          done();
        });

        discovery.on('error', (e) => done(e));
        discovery.start();
        // Start the service to advertise the Thing
        ad.start();
      })();
    }).timeout(6000);
  });

  afterEach(() => {
    servient.shutdown();
  });
});
