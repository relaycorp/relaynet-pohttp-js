# Node.js PoHTTP binding implementation

This is the client-side Node.js implementation of the Relaynet [Parcel Delivery over HTTP (PoHTTP) binding](https://specs.relaynet.link/RS-007).

Since PoHTTP establishes an [_external Parcel Delivery Connection (PDC)_](https://specs.relaynet.link/RS-000#external-pdc), this library is only relevant to developers implementing a gateway (like [Relaycorp's](https://github.com/relaycorp/relaynet-gateway-desktop)) or a [public endpoint](https://specs.relaynet.link/RS-000#addressing).

## Install

This library requires Node.js v10 or newer, and can be installed as follows:

```
npm install @relaycorp/relaynet-pohttp
```

## Use

As the client-side implementation of an external PDC, the only operation supported by this library is the delivery of parcels.

relaynet-pohttp-js is meant to be used with the [core library](https://www.npmjs.com/package/@relaycorp/relaynet-core). For example, this is how a relay would deliver a parcel to the public endpoint `rne+https://ping.relaycorp.tech`:

```javascript
import { deliverParcel } from '@relaycorp/relaynet-pohttp';

async function main() {
  // `parcelSerialized` is the ArrayBuffer representation of the parcel as a RAMF message
  const parcelSerialized = await yourFunctionToRetrieveTheParcel();

  await deliverParcel('ping.relaycorp.tech', parcelSerialized);
}
```

By default, a timeout of 3 seconds will be used and up to 3 consecutive redirects would be followed. `deliverParcel()` takes an optional `options` argument to customize these and other options.

TypeScript type declarations are included with this library.

## Use in integration or functional tests

Per the Relaynet specs, bindings like PoHTTP must be used over TLS, but this validation can be turned off in test suites that send requests to a mock HTTP server by passing the options `useTls=false` to `deliverParcel()`.
