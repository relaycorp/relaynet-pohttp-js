import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { get as getEnvVar } from 'env-var';
import * as https from 'https';

import PoHTTPError from './PoHTTPError';
import PoHTTPInvalidParcelError from './PoHTTPInvalidParcelError';

export interface DeliveryOptions {
  readonly gatewayAddress: string;
  readonly maxRedirects: number;
  readonly timeout: number;
}

/**
 * Deliver the parcel to the specified node endpoint.
 *
 * @param targetNodeUrl The URL of the target node endpoint.
 * @param parcelSerialized The RAMF serialization of the parcel.
 * @param options
 * @throws [[PoHTTPError]] when there's a networking error.
 */
export async function deliverParcel(
  targetNodeUrl: string,
  parcelSerialized: ArrayBuffer | Buffer,
  options: Partial<DeliveryOptions> = {},
): Promise<AxiosResponse> {
  const axiosOptions = {
    headers: options.gatewayAddress ? { 'X-Relaynet-Gateway': options.gatewayAddress } : {},
    maxRedirects: options.maxRedirects ?? 3,
    timeout: options.timeout ?? 3000,
  };
  const axiosInstance = axios.create({
    headers: { 'Content-Type': 'application/vnd.relaynet.parcel' },
    httpsAgent: new https.Agent({ keepAlive: true }),
  });
  const response = await postRequest(targetNodeUrl, parcelSerialized, axiosInstance, axiosOptions);
  if (response.status === 307 || response.status === 308) {
    throw new PoHTTPError(`Reached maximum number of redirects (${axiosOptions.maxRedirects})`);
  }
  return response;
}

interface SupportedAxiosRequestConfig {
  readonly headers: { readonly [key: string]: any };
  readonly maxRedirects: number;
  readonly timeout: number;
}

async function postRequest(
  url: string,
  body: ArrayBuffer | Buffer,
  axiosInstance: AxiosInstance,
  options: SupportedAxiosRequestConfig,
): Promise<AxiosResponse> {
  const isTlsRequired = getEnvVar('POHTTP_TLS_REQUIRED', 'true').asBool();
  if (isTlsRequired && url.startsWith('http:')) {
    throw new PoHTTPError(`Can only POST to HTTPS URLs (got ${url})`);
  }
  // tslint:disable-next-line:no-let
  let response;
  try {
    response = await axiosInstance.post(url, body, {
      headers: options.headers,
      maxRedirects: 0,
      timeout: options.timeout,
    });
  } catch (error) {
    const responseStatus = error.response?.status;
    if (responseStatus && responseStatus === 403) {
      throw new PoHTTPInvalidParcelError('Server refused to accept parcel');
    }
    if (!responseStatus || responseStatus < 300 || 400 <= responseStatus) {
      throw new PoHTTPError(error, 'Failed to deliver parcel');
    }
    response = error.response;
  }

  if ((response.status === 307 || response.status === 308) && 0 < options.maxRedirects) {
    // Axios doesn't support 307 or 308 redirects: https://github.com/axios/axios/issues/2429,
    // so we have to follow the redirect manually.
    return postRequest(response.headers.location, body, axiosInstance, {
      ...options,
      maxRedirects: options.maxRedirects - 1,
    });
  }

  return response;
}
