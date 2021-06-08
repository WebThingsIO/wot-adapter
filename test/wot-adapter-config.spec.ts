/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
import chai, { expect } from 'chai';
import WoTDevice from '../src/wot-device';
import { stubInterface } from 'ts-sinon';
import { ConsumedThing } from '@node-wot/core';
import { WebThingEndpoint, WoTAdapterConfig, NoSecurityData, BasicSecurityData } from '../src/wot-adapter-config';
import sinon, { fake, SinonStub, spy } from 'sinon';
import { AddonManagerProxy, Event } from 'gateway-addon';
import { verbose, Database as SQLiteDatabase } from 'sqlite3';
import sinonChai from 'sinon-chai';


const sqlite3 = verbose();

chai.use(sinonChai);

describe('WoT Config data', () => {
  ;

  const DB_NAME = './test.db';
  // creates table is not exist


  const sqldb: SQLiteDatabase = new sqlite3.Database(DB_NAME, (err) => {
    if (err) {
      console.log('Could not connect to database', err);
    } else {
      console.log('Connected to database');
    }
  }
  );


  sqldb.configure('busyTimeout', 10000);

  sqldb.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)', (err) => {
    if (err) {
      console.log('Could not connect to database', err);
    } else {
      console.log('Connected to database');
    }
  }
  );

  sqldb.close();

  const url1 = 'http://pippo.txt';
  const url2 = 'http://pluto.txt';
  const url3 = 'http://nourl.txt';
  const url4 = 'http://noauth.txt';
  const url5 = 'http://mdauth.txt';


  const noauth = { schema: 'nosec' } as NoSecurityData;
  const bauth = { schema: 'basic', user: 'tex', password: 'willer' } as BasicSecurityData;

  it('Should save and load', async () => {
    {
      const w: WoTAdapterConfig = new WoTAdapterConfig('pippo', DB_NAME);

      w.add({ url: url1 });
      w.add({ url: url2 });
      w.add({ url: url4, authentication: noauth });
      w.add({ url: url5, authentication: bauth });
      console.log(JSON.stringify(w));

      await w.save();
    }
    {
      const w: WoTAdapterConfig = new WoTAdapterConfig('pippo', DB_NAME);
      await w.load();
      expect(w.containsUrl(url1)).be.true;
      expect(w.containsUrl(url2)).be.true;
      expect(w.containsUrl(url3)).be.false;
      expect(w.containsUrl(url4)).be.true;
      expect(w.containsUrl(url5)).be.true;

      expect(w.getUrlData(url1)).be.undefined;
      expect(w.getUrlData(url4) == noauth);
      expect(w.getUrlData(url5) == bauth);
    }
  });
});


