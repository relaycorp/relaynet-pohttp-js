# Node.js PoHTTP binding implementation

[![CircleCI](https://circleci.com/gh/relaycorp/relaynet-pohttp-js.svg?style=svg)](https://circleci.com/gh/relaycorp/relaynet-pohttp-js)
[![Known Vulnerabilities](https://snyk.io//test/github/relaycorp/relaynet-pohttp-js/badge.svg?targetFile=package.json)](https://snyk.io//test/github/relaycorp/relaynet-pohttp-js?targetFile=package.json)
[![npm](https://img.shields.io/npm/v/@relaycorp/relaynet-pohttp)](https://www.npmjs.com/package/@relaycorp/relaynet-pohttp)

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

const relayAddress = 'rng+https://relay.relaycorp.tech';

async function main() {
  // `parcelSerialized` is the ArrayBuffer representation of the parcel as a RAMF message
  const parcelSerialized = await yourFunctionToRetrieveTheParcel();

  await deliverParcel('https://ping.relaycorp.tech', parcelSerialized, {
    relayAddress,
  });
}
```

By default, a timeout of 3 seconds will be used and up to 3 consecutive redirects would be followed. `deliverParcel` takes an optional `options` argument to customize these and other options.

TypeScript type declarations are included with this library.

## Support

If you have any questions or comments, you can [find us on Gitter](https://gitter.im/relaynet/community) or [create an issue on the GitHub project](https://github.com/relaycorp/relaynet-pohttp-js/issues/new/choose).

## Updates

Releases are automatically published on GitHub and NPM, and the [changelog can be found on GitHub](https://github.com/relaycorp/relaynet-pohttp-js/releases).
