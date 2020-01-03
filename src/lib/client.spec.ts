import axios from 'axios';
import bufferToArray from 'buffer-to-arraybuffer';

import { expectPromiseToReject, getMockContext } from './_test_utils';
import { deliverParcel, HTTPSError } from './client';
import PoHTTPError from './PoHTTPError';

describe('deliverParcel', () => {
  const url = 'https://example.com';
  const body = bufferToArray(Buffer.from('Hey'));
  const stubResponse = { status: 200 };
  const stubAxiosPost = jest.fn();

  beforeEach(() => {
    stubAxiosPost.mockResolvedValueOnce(stubResponse);

    // @ts-ignore
    jest.spyOn(axios, 'create').mockReturnValueOnce({ post: stubAxiosPost });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Body should be POSTed to the specified URL', async () => {
    await deliverParcel(url, body);

    expect(stubAxiosPost).toBeCalledTimes(1);
    const postCallArgs = getMockContext(stubAxiosPost).calls[0];
    expect(postCallArgs[0]).toEqual(url);
    expect(postCallArgs[1]).toBe(body);
  });

  describe('Relay address', () => {
    test('Relay address should be included if specified', async () => {
      const relayAddress = 'relay-address';
      await deliverParcel(url, body, { relayAddress });

      expect(stubAxiosPost).toBeCalledTimes(1);
      const postCallArgs = getMockContext(stubAxiosPost).calls[0];
      expect(postCallArgs[2]).toHaveProperty('headers.X-Relaynet-Relay', relayAddress);
    });

    test('Relay address should be absent by default', async () => {
      await deliverParcel(url, body);

      expect(stubAxiosPost).toBeCalledTimes(1);
      const postCallArgs = getMockContext(stubAxiosPost).calls[0];
      expect(postCallArgs[2]).not.toHaveProperty('headers.X-Relaynet-Relay');
    });
  });

  test('Axios response should be returned', async () => {
    const response = await deliverParcel(url, body);

    expect(response).toBe(stubResponse);
  });

  test('Agent should be configured to use Keep-Alive', async () => {
    jest.spyOn(axios, 'create');

    await deliverParcel(url, body);

    expect(axios.create).toBeCalledTimes(1);
    const axiosCreateCall = getMockContext(axios.create).calls[0];
    expect(axiosCreateCall[0]).toHaveProperty('httpsAgent');
    const agent = axiosCreateCall[0].httpsAgent;
    expect(agent).toHaveProperty('keepAlive', true);
  });

  test('Non-TLS URLs should be refused', async () => {
    await expectPromiseToReject(
      deliverParcel('http://example.com', body),
      new Error('Can only POST to HTTPS URLs (got http://example.com)'),
    );
  });

  describe('Timeout', () => {
    test('Request should time out after 3 seconds by default', async () => {
      await deliverParcel(url, body);

      const postCallArgs = getMockContext(stubAxiosPost).calls[0];
      expect(postCallArgs[2]).toHaveProperty('timeout', 3000);
    });

    test('A custom timeout should be accepted', async () => {
      const timeout = 4321;
      await deliverParcel(url, body, { timeout });

      const postCallArgs = getMockContext(stubAxiosPost).calls[0];
      expect(postCallArgs[2]).toHaveProperty('timeout', timeout);
    });
  });

  describe('Redirects', () => {
    const stubRedirectUrl = `${url}/foo`;
    const stubRedirectResponse = {
      ...stubResponse,
      headers: { location: stubRedirectUrl },
      status: 307,
    };

    beforeEach(() => {
      // @ts-ignore
      stubAxiosPost.mockReset();
    });

    test('HTTP 307 redirect should be followed', async () => {
      stubAxiosPost.mockRejectedValueOnce({
        response: { ...stubRedirectResponse, status: 307 },
      });
      stubAxiosPost.mockResolvedValueOnce(Promise.resolve({ status: 202 }));

      await deliverParcel(url, body);

      expect(stubAxiosPost).toBeCalledTimes(2);
      const postCall2Args = getMockContext(stubAxiosPost).calls[1];
      expect(postCall2Args[0]).toEqual(stubRedirectUrl);
    });

    test('HTTP 308 redirect should be followed', async () => {
      stubAxiosPost.mockRejectedValueOnce({
        response: { ...stubRedirectResponse, status: 308 },
      });
      stubAxiosPost.mockResolvedValueOnce({ status: 202 });

      await deliverParcel(url, body);

      expect(stubAxiosPost).toBeCalledTimes(2);
      const postCall2Args = getMockContext(stubAxiosPost).calls[1];
      expect(postCall2Args[0]).toEqual(stubRedirectUrl);
    });

    test('Responses with unsupported 3XX status codes should be returned as is', async () => {
      const redirectResponse = { ...stubRedirectResponse, status: 302 };
      stubAxiosPost.mockRejectedValueOnce({ response: redirectResponse });

      const response = await deliverParcel(url, body);

      expect(stubAxiosPost).toBeCalledTimes(1);
      expect(response).toBe(redirectResponse);
    });

    test('Original arguments should be honored when following redirects', async () => {
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockResolvedValueOnce({ status: 202 });

      const options = { relayAddress: 'the address', timeout: 2 };
      await deliverParcel(url, body, options);

      expect(stubAxiosPost).toBeCalledTimes(2);
      const postCall2Args = getMockContext(stubAxiosPost).calls[1];
      expect(postCall2Args[1]).toEqual(body);
      expect(postCall2Args[2]).toEqual({
        headers: { 'X-Relaynet-Relay': options.relayAddress },
        maxRedirects: 0,
        timeout: options.timeout,
      });
    });

    test('Redirects should be followed up to a maximum of 3 times by default', async () => {
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockResolvedValueOnce(stubResponse);

      const response = await deliverParcel(url, body);

      expect(response).toBe(stubResponse);
    });

    test('Exceeding the maximum number of redirects should result in error', async () => {
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });

      await expectPromiseToReject(
        deliverParcel(url, body),
        new HTTPSError('Reached maximum number of redirects (3)'),
      );
    });

    test('The maximum number of redirects should be customizable', async () => {
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockResolvedValueOnce(stubResponse);

      const response = await deliverParcel(url, body, { maxRedirects: 4 });

      expect(response).toBe(stubResponse);
    });
  });

  test('Unexpected axios exceptions should be wrapped rethrown', async () => {
    // @ts-ignore
    stubAxiosPost.mockReset();
    const axiosError = new Error('Haha, in thy face');
    stubAxiosPost.mockRejectedValueOnce(axiosError);

    const expectedError = new PoHTTPError(axiosError, 'Failed to deliver parcel');
    await expectPromiseToReject(deliverParcel(url, body), expectedError);
  });
});
