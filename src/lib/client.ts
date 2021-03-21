import { BindingType, PublicNodeAddress, resolvePublicAddress } from '@relaycorp/relaynet-core';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { get as getEnvVar } from 'env-var';
import * as https from 'https';

import PoHTTPClientBindingError from './PoHTTPClientBindingError';
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
    headers: options.gatewayAddress ? { 'X-Awala-Gateway': options.gatewayAddress } : {},
    maxRedirects: options.maxRedirects ?? 3,
    timeout: options.timeout ?? 3000,
  };
  const axiosInstance = axios.create({
    headers: { 'Content-Type': 'application/vnd.awala.parcel' },
    httpsAgent: new https.Agent({ keepAlive: true }),
  });
  const url = await resolveURL(targetNodeUrl);
  const response = await postRequest(url, parcelSerialized, axiosInstance, axiosOptions);
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

async function resolveURL(targetNodeUrl: string): Promise<string> {
  const urlParts = new URL(targetNodeUrl);
  let address: PublicNodeAddress | null;
  try {
    address = await resolvePublicAddress(urlParts.host, BindingType.PDC);
  } catch (err) {
    throw new PoHTTPError(err, 'Public address resolution failed');
  }
  return address ? `${urlParts.protocol}//${address.host}:${address.port}` : targetNodeUrl;
}

async function postRequest(
  url: string,
  body: ArrayBuffer | Buffer,
  axiosInstance: AxiosInstance,
  options: SupportedAxiosRequestConfig,
): Promise<AxiosResponse> {
  const isTlsRequired = getEnvVar('POHTTP_TLS_REQUIRED').default('true').asBool();
  if (isTlsRequired && url.startsWith('http:')) {
    throw new PoHTTPError(`Can only POST to HTTPS URLs (got ${url})`);
  }
  let response;
  try {
    response = await axiosInstance.post(url, body, {
      headers: options.headers,
      maxRedirects: 0,
      timeout: options.timeout,
    });
  } catch (error) {
    if (!error.response) {
      throw new PoHTTPError(`Connection error: ${error.message}`);
    }

    const responseStatus = error.response.status;
    const reason = error.response.data?.message;
    if (responseStatus === 403) {
      throw new PoHTTPInvalidParcelError(
        reason ? `Server rejected parcel: ${reason}` : 'Server rejected parcel',
      );
    }
    if (400 <= responseStatus && responseStatus < 500) {
      throw new PoHTTPClientBindingError(
        reason
          ? `Server rejected request due to protocol violation (HTTP ${responseStatus}): ${reason}`
          : `Server rejected request due to protocol violation (HTTP ${responseStatus})`,
      );
    }
    if (!isStatusCodeValidRedirect(responseStatus) || 500 <= responseStatus) {
      throw new PoHTTPError(
        reason
          ? `Failed to deliver parcel (HTTP ${responseStatus}): ${reason}`
          : `Failed to deliver parcel (HTTP ${responseStatus})`,
      );
    }
    response = error.response;
  }

  if (isStatusCodeValidRedirect(response.status) && 0 < options.maxRedirects) {
    // Axios doesn't support 307 or 308 redirects: https://github.com/axios/axios/issues/2429,
    // so we have to follow the redirect manually.
    return postRequest(response.headers.location, body, axiosInstance, {
      ...options,
      maxRedirects: options.maxRedirects - 1,
    });
  }

  return response;
}

function isStatusCodeValidRedirect(statusCode: number): boolean {
  return statusCode === 307 || statusCode === 308;
}
