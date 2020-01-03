import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as https from 'https';

import { PoHTTPError } from './PoHTTPError';

interface DeliveryOptions {
  readonly headers: { readonly [key: string]: string };
  readonly maxRedirects: number;
  readonly timeout: number;
}

export async function deliverParcel(
  targetNodeUrl: string,
  parcelSerialized: ArrayBuffer,
  options: Partial<DeliveryOptions> = {},
): Promise<AxiosResponse> {
  const finalOptions = {
    headers: {},
    maxRedirects: 3,
    timeout: 3000,
    ...options,
  };
  const axiosInstance = axios.create({ httpsAgent: new https.Agent({ keepAlive: true }) });
  const response = await postRequest(targetNodeUrl, parcelSerialized, axiosInstance, finalOptions);
  if (response.status === 307 || response.status === 308) {
    throw new HTTPSError(`Reached maximum number of redirects (${finalOptions.maxRedirects})`);
  }
  return response;
}

async function postRequest(
  url: string,
  body: ArrayBuffer,
  axiosInstance: AxiosInstance,
  options: DeliveryOptions,
): Promise<AxiosResponse> {
  if (url.startsWith('http:')) {
    throw new HTTPSError(`Can only POST to HTTPS URLs (got ${url})`);
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
      throw error;
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

export class HTTPSError extends PoHTTPError {}
