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

  private _continuos_discovery = false;

  private _useObservable = false;

  public get useObservable(): boolean {
    return this._useObservable;
  }

  public get continuosDiscovery(): boolean {
    return this._continuos_discovery;
  }

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

  private isAuthenticationData(configuration: unknown):
                              configuration is (WebThingEndpoint['authentication'] | undefined) {
    // eslint-disable-next-line no-undefined
    return configuration === undefined || !!(configuration as AuthenticationDataType).schema;
  }

  public async load(): Promise<void> {
    await this.db.open();
    const db_config: Record<string, unknown> = await this.db.loadConfig();

    this._retries = db_config.retries as number ?? this._retries;
    this._pollInterval = db_config.pollInterval as number ?? this._pollInterval;
    this._retryInterval = db_config.retryInterval as number ?? this.retryInterval;
    this._continuos_discovery = db_config.continuosDiscovery as boolean ?? this.continuosDiscovery;
    this._useObservable = db_config.useObservable as boolean ?? this._useObservable;

    const endpoints = db_config.endpoints as WebThingEndpoint[];
    if(!endpoints) {
      console.warn('No endpoints found');
      return;
    }

    for (const endpoint of endpoints) {
      // check for type correctnes
      if(typeof endpoint.url !== 'string') {
        console.log('Invalid configuration data found !', endpoint);
      }

      const data = endpoint.authentication;
      if (!this.isAuthenticationData(data)) {
        console.log('Invalid authentication data found !', endpoint.url, ':', data);
        continue;
      }

      this.stored_endpoints.set(endpoint.url, data);
    }
    this.db.close();
  }

  public async save(): Promise<void> {
    await this.db.open();
    const newObject: { endpoints: WebThingEndpoint[] } = { endpoints: [] };

    for (const [url, authentication] of this.stored_endpoints) {
      newObject.endpoints.push({ url, authentication });
    }
    await this.db.saveConfig(newObject);
    this.db.close();
  }

  public add(d: WebThingEndpoint): void {
    this.stored_endpoints.set(d.url, d.authentication);
  }

  public remove(url: string): void {
    this.stored_endpoints.delete(url);
  }

  public urlList(): IterableIterator<string> {
    return this.stored_endpoints.keys();
  }

  public configData(url: string): AuthenticationDataType | undefined {
    let result;
    const data = this.stored_endpoints.get(url);

    if(data !== null) {
      result = data;
    }

    return result;
  }


  public containsUrl(u: string): boolean {
    return this.stored_endpoints.has(u);
  }
}
