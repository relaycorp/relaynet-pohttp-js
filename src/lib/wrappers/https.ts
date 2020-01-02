import axios, { AxiosResponse } from 'axios';

import { PoHTTPError } from '../PoHTTPError';

interface RequestOptions {
  readonly headers: { [key: string]: string };
  readonly maxRedirects: number;
  readonly timeout: number;
}

export async function postRequest(
  url: string,
  body: Buffer,
  options: Partial<RequestOptions> = {},
): Promise<AxiosResponse> {
  if (url.startsWith('http:')) {
    throw new HTTPSError(`Can only POST to HTTPS URLs (got ${url})`);
  }
  let response;
  try {
    response = await axios.post(url, body, {
      headers: options.headers,
      maxRedirects: 0,
      timeout: options.timeout || 3000,
    });
  } catch (error) {
    const responseStatus = error.response?.status;
    if (!responseStatus || responseStatus < 300 || 400 <= responseStatus) {
      throw error;
    }
    response = error.response;
  }

  if (response.status === 307 || response.status === 308) {
    // Axios doesn't support 307 or 308 redirects: https://github.com/axios/axios/issues/2429,
    // so we have to follow the redirect manually.
    const maxRedirects = options.maxRedirects ?? 3;
    if (maxRedirects === 0) {
      throw new HTTPSError('Reached maximum number of redirects');
    }
    return postRequest(response.headers.location, body, {
      ...options,
      maxRedirects: maxRedirects - 1,
    });
  }

  return response;
}

export class HTTPSError extends PoHTTPError {}
