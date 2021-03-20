import PoHTTPError from './PoHTTPError';

/**
 * PoHTTP server refused parcel delivery, claiming a protocol violation by this client.
 */
export default class PoHTTPClientBindingError extends PoHTTPError {}
