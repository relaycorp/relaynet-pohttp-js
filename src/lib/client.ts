import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as https from 'https';

import PoHTTPError from './PoHTTPError';

export interface DeliveryOptions {
  readonly relayAddress: string;
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
  parcelSerialized: ArrayBuffer,
  options: Partial<DeliveryOptions> = {},
): Promise<AxiosResponse> {
  const axiosOptions = {
    headers: options.relayAddress ? { 'X-Relaynet-Relay': options.relayAddress } : {},
    maxRedirects: options.maxRedirects ?? 3,
    timeout: options.timeout ?? 3000,
  };
  const axiosInstance = axios.create({ httpsAgent: new https.Agent({ keepAlive: true }) });
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
  body: ArrayBuffer,
  axiosInstance: AxiosInstance,
  options: SupportedAxiosRequestConfig,
): Promise<AxiosResponse> {
  if (url.startsWith('http:')) {
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
