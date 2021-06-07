import { Database } from 'gateway-addon';

export type AuthenticationDataType = NoSecurityData | JSONWebTokenSecuiryData |
BasicSecurityData | DigestSecurityData;

interface AuthenticationData {
  schema: string;
};

export interface NoSecurityData extends AuthenticationData{
  schema: 'nosec';
}
export interface JSONWebTokenSecuiryData extends AuthenticationData{
  schema: 'jwt';
  token: string;
}
export interface BasicSecurityData extends AuthenticationData{
  schema: 'basic';
  user: string;
  password: string;
}
export interface DigestSecurityData extends AuthenticationData{
  schema: 'digest';
  digest: string;
}

export type WebThingEndpoint = {
  url: string;
  authentication?: AuthenticationDataType;
};
/**
 * {
 *  "retries" : 1,
 *  "pollInterval": 3,
 *  "retryInterval": 10,
 *  "endpoints": {
 *    "http://test.endpoint.it/thing1": {
 *      "authentication": {
 *         "scheme": "nosec"
 *      }
 *    }
 *  }
 * }
 */
export class WoTAdapterConfig {
  private db: Database;

  private stored_endpoints: Map<string, WebThingEndpoint['authentication']> = new Map();

  private _pollInterval = 1;

  private _retries = 3;

  private _retryInterval = 10;

  public get pollInterval(): number {
    return this._pollInterval;
  }

  public get retries(): number {
    return this._retries;
  }

  public get retryInterval(): number {
    return this._retryInterval;
  }


  public constructor(name: string, path?: string) {
    this.db = new Database(name, path);
  }

  // eslint-disable-next-line max-len

  private isWTE(pet: unknown): pet is AuthenticationDataType {
    // eslint-disable-next-line no-undefined
    return (pet as AuthenticationDataType).schema !== undefined;
  }

  public async load(): Promise<void> {
    await this.db.open();
    const db_config: Record<string, unknown> = await this.db.loadConfig();
    // eslint-disable-next-line max-len
    for (const k in db_config) {
      const isValid = this.isWTE(db_config[k]);

      // check for type correctnes
      if (isValid == false) {
        console.log('Invalid configuration data found ! ');
        continue;
      }


      let e: WebThingEndpoint['authentication'] | undefined;
      const dbe = <WebThingEndpoint['authentication'] | null> db_config[k];
      if (dbe) {
        e = dbe;
      }
      this.stored_endpoints.set(k, e);
    }
  }

  public async save(): Promise<void> {
    await this.db.open();
    const newObject: Record<string, unknown> = {};

    for (const [key, value] of this.stored_endpoints) {
      if (value) {
        newObject[key] = value;
      } else {
        newObject[key] = null;
      }
    }

    await this.db.saveConfig(newObject);
  }

  public add(d: WebThingEndpoint): void {
    this.stored_endpoints.set(d.url, d.authentication);
    this.save();
  }

  public remove(url: string): void {
    this.stored_endpoints.delete(url);
    this.save();
  }

  public urlList(): IterableIterator<string> {
    return this.stored_endpoints.keys();
  }

  public configData(url: string): AuthenticationDataType | undefined {
    return this.stored_endpoints.get(url);
  }


  public containsUrl(u: string): boolean {
    return this.stored_endpoints.has(u);
  }

  public getUrlData(u: string): WebThingEndpoint['authentication'] | undefined {
    return this.stored_endpoints.get(u);
  }

}
