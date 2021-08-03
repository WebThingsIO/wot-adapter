import chai, { expect } from 'chai';
import { WoTAdapterConfig, NoSecurityData, BasicSecurityData } from '../src/wot-adapter-config';
import { verbose, Database as SQLiteDatabase } from 'sqlite3';
import sinonChai from 'sinon-chai';


const sqlite3 = verbose();

chai.use(sinonChai);

describe('WoT Adapter configuration', () => {
  const DB_NAME = './out/test/test.db';
  const url1 = 'http://pippo.txt';
  const url2 = 'http://pluto.txt';
  const url3 = 'http://nourl.txt';
  const url4 = 'http://noauth.txt';
  const url5 = 'http://mdauth.txt';


  const noauth = { schema: 'nosec' } as NoSecurityData;
  const bauth = { schema: 'basic', user: 'tex', password: 'willer' } as BasicSecurityData;

  before((done) => {
    const sqldb: SQLiteDatabase = new sqlite3.Database(DB_NAME);
    sqldb.on('error', (err) => done(err));
    sqldb.on('close', () => done());

    sqldb.configure('busyTimeout', 10000);

    sqldb.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');

    sqldb.close();
  });

  it('Should save and load', async () => {
    {
      const w: WoTAdapterConfig = new WoTAdapterConfig('pippo', DB_NAME);

      w.add({ url: url1 });
      w.add({ url: url2 });
      w.add({ url: url4, authentication: noauth });
      w.add({ url: url5, authentication: bauth });

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

      expect(w.configData(url1)).be.undefined;
      expect(w.configData(url2)).be.undefined;
      expect(w.configData(url4) == noauth);
      expect(w.configData(url5) == bauth);
    }
  });
});


