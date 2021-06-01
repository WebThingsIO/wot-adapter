import { DiscoveryOptions } from './discovery';

export class WoTAdapterConfigData {
  private __url = '';

  private __disc_opts: DiscoveryOptions['authentication'] | undefined;

  public constructor(url: string, authentication?: DiscoveryOptions['authentication']) {
    this.__url = url;
    this.__disc_opts = authentication;
  }

  public get url(): string {
    return this.__url;
  }


  public set url(v: string) {
    this.__url = v;
  }

  public get authData(): DiscoveryOptions['authentication'] | undefined {
    return this.__disc_opts;
  }

  public set authData(v: DiscoveryOptions['authentication'] | undefined) {
    this.__disc_opts = v;
  }
}
