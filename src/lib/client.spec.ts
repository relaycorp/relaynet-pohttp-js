import * as relaynet from '@relaycorp/relaynet-core';
import axios from 'axios';
import bufferToArray from 'buffer-to-arraybuffer';

import { expectPromiseToReject, getMockContext, getMockInstance, mockEnvVars } from './_test_utils';
import { deliverParcel, DeliveryOptions } from './client';
import PoHTTPClientBindingError from './PoHTTPClientBindingError';
import PoHTTPError from './PoHTTPError';
import PoHTTPInvalidParcelError from './PoHTTPInvalidParcelError';

jest.mock('@relaycorp/relaynet-core', () => {
  const realRelaynet = jest.requireActual('@relaycorp/relaynet-core');
  return { ...realRelaynet, resolvePublicAddress: jest.fn() };
});

describe('deliverParcel', () => {
  const host = 'example.com';
  const targetHost = 'pdc.example.com';
  const targetPort = 1234;
  const url = `https://${host}`;
  const body = bufferToArray(Buffer.from('Hey'));
  const stubResponse = { status: 200 };
  const stubAxiosPost = jest.fn();

  beforeEach(() => {
    stubAxiosPost.mockResolvedValueOnce(stubResponse);

    jest.spyOn(axios, 'create').mockReturnValueOnce({ post: stubAxiosPost } as any);
  });

  beforeEach(() => {
    getMockInstance(relaynet.resolvePublicAddress).mockReset();
    getMockInstance(relaynet.resolvePublicAddress).mockResolvedValue({
      host: targetHost,
      port: targetPort,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Target URL should be resolved', async () => {
    await deliverParcel(url, body);

    expect(stubAxiosPost).toBeCalledWith(
      `https://${targetHost}:${targetPort}`,
      expect.anything(),
      expect.anything(),
    );

    expect(relaynet.resolvePublicAddress).toBeCalledWith(host, relaynet.BindingType.PDC);
  });

  test('Target URL should be used as is if public address record does not exist', async () => {
    getMockInstance(relaynet.resolvePublicAddress).mockResolvedValue(null);

    await deliverParcel(url, body);

    expect(stubAxiosPost).toBeCalledWith(url, expect.anything(), expect.anything());
  });

  test('Parcel should be request body', async () => {
    await deliverParcel(url, body);

    expect(stubAxiosPost).toBeCalledWith(expect.anything(), body, expect.anything());
  });

  test('Public address resolution errors should be wrapped', async () => {
    const error = new Error('DNSSEC failed');
    getMockInstance(relaynet.resolvePublicAddress).mockRejectedValue(error);

    await expectPromiseToReject(
      deliverParcel(url, body),
      new PoHTTPError(`Public address resolution failed: ${error.message}`),
    );

    expect(stubAxiosPost).not.toBeCalled();
  });

  test('Request content type should be application/vnd.awala.parcel', async () => {
    jest.spyOn(axios, 'create');

    await deliverParcel(url, body);

    expect(axios.create).toBeCalledTimes(1);
    const axiosCreateCall = getMockContext(axios.create).calls[0];
    expect(axiosCreateCall[0]).toHaveProperty(
      'headers.Content-Type',
      'application/vnd.awala.parcel',
    );
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

  describe('POHTTP_TLS_REQUIRED', () => {
    test('Non-TLS URLs should be refused if POHTTP_TLS_REQUIRED is undefined', async () => {
      mockEnvVars({});

      await expectPromiseToReject(
        deliverParcel('http://example.com', body),
        new Error(`Can only POST to HTTPS URLs (got http://${targetHost}:${targetPort})`),
      );
    });

    test('Non-TLS URLs should be allowed if POHTTP_TLS_REQUIRED=false', async () => {
      mockEnvVars({ POHTTP_TLS_REQUIRED: 'false' });

      await deliverParcel('http://example.com', body);

      expect(stubAxiosPost).toBeCalledTimes(1);
      const postCallArgs = getMockContext(stubAxiosPost).calls[0];
      expect(postCallArgs[0]).toEqual(`http://${targetHost}:${targetPort}`);
    });

    test('Non-TLS URLs should be refused if POHTTP_TLS_REQUIRED=true', async () => {
      mockEnvVars({ POHTTP_TLS_REQUIRED: 'true' });

      await expectPromiseToReject(
        deliverParcel('http://example.com', body),
        new Error(`Can only POST to HTTPS URLs (got http://${targetHost}:${targetPort})`),
      );
    });
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

    test('Responses with unsupported 3XX status codes should result in errors', async () => {
      const redirectResponse = { ...stubRedirectResponse, status: 302 };
      stubAxiosPost.mockRejectedValueOnce({ response: redirectResponse });

      await expect(deliverParcel(url, body)).rejects.toEqual(
        new PoHTTPError('Failed to deliver parcel (HTTP 302)'),
      );
    });

    test('Original arguments should be honored when following redirects', async () => {
      stubAxiosPost.mockRejectedValueOnce({ response: stubRedirectResponse });
      stubAxiosPost.mockResolvedValueOnce({ status: 202 });

      const options: Partial<DeliveryOptions> = { timeout: 2 };
      await deliverParcel(url, body, options);

      expect(stubAxiosPost).toBeCalledTimes(2);
      const postCall2Args = getMockContext(stubAxiosPost).calls[1];
      expect(postCall2Args[1]).toEqual(body);
      expect(postCall2Args[2]).toEqual({
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
        new PoHTTPError('Reached maximum number of redirects (3)'),
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

  test('HTTP 403 should throw a PoHTTPInvalidParcelError', async () => {
    // @ts-ignore
    stubAxiosPost.mockReset();
    stubAxiosPost.mockRejectedValueOnce({ response: { status: 403 } });

    await expect(deliverParcel(url, body)).rejects.toEqual(
      new PoHTTPInvalidParcelError('Server rejected parcel'),
    );
  });

  test('PoHTTPInvalidParcelError should mention the reason if available', async () => {
    // @ts-ignore
    stubAxiosPost.mockReset();
    const reason = 'Denied';
    stubAxiosPost.mockRejectedValueOnce({ response: { data: { message: reason }, status: 403 } });

    await expect(deliverParcel(url, body)).rejects.toEqual(
      new PoHTTPInvalidParcelError(`Server rejected parcel: ${reason}`),
    );
  });

  test('HTTP 40X should throw a PoHTTPClientBindingError', async () => {
    // @ts-ignore
    stubAxiosPost.mockReset();
    stubAxiosPost.mockRejectedValueOnce({ response: { status: 400 } });

    await expect(deliverParcel(url, body)).rejects.toEqual(
      new PoHTTPClientBindingError('Server rejected request due to protocol violation (HTTP 400)'),
    );
  });

  test('PoHTTPClientBindingError should mention the reason if available', async () => {
    // @ts-ignore
    stubAxiosPost.mockReset();
    const reason = 'Denied';
    stubAxiosPost.mockRejectedValueOnce({ response: { data: { message: reason }, status: 400 } });

    await expect(deliverParcel(url, body)).rejects.toEqual(
      new PoHTTPClientBindingError(
        `Server rejected request due to protocol violation (HTTP 400): ${reason}`,
      ),
    );
  });

  test('Connection error should be replaced with a simpler error', async () => {
    // .. That doesn't leak the request or response.
    // @ts-ignore
    stubAxiosPost.mockReset();
    const axiosError = new Error('Haha, in thy face');
    stubAxiosPost.mockRejectedValueOnce(axiosError);

    const expectedError = new PoHTTPError(`Connection error: ${axiosError.message}`);
    await expectPromiseToReject(deliverParcel(url, body), expectedError);
  });

  test('HTTP 5XX errors should mention the reason if available', async () => {
    // @ts-ignore
    stubAxiosPost.mockReset();
    const reason = 'Denied';
    const status = 500;
    stubAxiosPost.mockRejectedValueOnce({ response: { data: { message: reason }, status } });

    await expect(deliverParcel(url, body)).rejects.toEqual(
      new PoHTTPError(`Failed to deliver parcel (HTTP ${status}): ${reason}`),
    );
  });

  test('HTTP 5XX errors should not mention the reason when absent', async () => {
    // @ts-ignore
    stubAxiosPost.mockReset();
    const status = 500;
    stubAxiosPost.mockRejectedValueOnce({ response: { data: {}, status } });

    await expect(deliverParcel(url, body)).rejects.toEqual(
      new PoHTTPError(`Failed to deliver parcel (HTTP ${status})`),
    );
  });
});
