import { PoHTTPError } from './PoHTTPError';

/**
 * PoHTTP server refused parcel delivery, claiming a protocol violation by this client.
 */
export class PoHTTPClientBindingError extends PoHTTPError {}
