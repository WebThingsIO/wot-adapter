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

  public async load(): Promise<void> {
    await this.db.open();
    const db_config: Record<string, unknown> = await this.db.loadConfig();
    const endpoints = db_config.endpoints as { [url: string]: WebThingEndpoint['authentication'] };

    for (const k in endpoints) {
      const url = <string> k;
      // TODO: check if scheme is among the supported schemes
      const endpoint = endpoints[url];
      this.stored_endpoints.set(url, endpoint);
    }
  }

  public async save(): Promise<void> {
    await this.db.open();
    const newObject: Record<string, unknown> = {};

    for (const [key, value] of this.stored_endpoints) {
      newObject[key] = value;
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


}
