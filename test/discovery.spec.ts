import { expect } from 'chai';
import { Servient } from '@node-wot/core';
import { HttpServer } from '@node-wot/binding-http';
import { direct } from '../src/discovery';


describe('Discovery api tests', () => {
  it('fetch device directly', async () => {
    const servient = new Servient();
    servient.addServer(new HttpServer());
    const WoT = await servient.start();
    const thing = await WoT.produce({ title: 'test-thing' });
    await thing.expose();
    const fetched = await direct('http://127.0.0.1:8080/test-thing');
    // expect(false).to.be.true('fix me');
    expect(thing.getThingDescription()).to.deep.eq(fetched[0]);
    await servient.shutdown();
  });
});

