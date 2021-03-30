import { Adapter as GatewayAdapter} from 'gateway-addon/lib/adapter'

declare global {
    var Adapter: typeof GatewayAdapter;
}

