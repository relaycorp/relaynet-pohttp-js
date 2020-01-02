import axios from 'axios';

import { expectPromiseToReject, getMockContext } from '../_test_utils';
import { HTTPSError, postRequest } from './https';

describe('postRequest', function() {
  const url = 'https://example.com';
  const body = Buffer.from('Hey');
  const stubResponse = { status: 200 };

  beforeEach(() => {
    jest.spyOn(axios, 'post').mockResolvedValueOnce(Promise.resolve(stubResponse));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Body should be POSTed to the specified URL', async () => {
    await postRequest(url, body);

    expect(axios.post).toBeCalledTimes(1);
    const postCallArgs = getMockContext(axios.post).calls[0];
    expect(postCallArgs[0]).toEqual(url);
    expect(postCallArgs[1]).toBe(body);
  });

  test('Additional request headers should be accepted', async () => {
    const headers = { 'X-Foo': 'Bar' };
    await postRequest(url, body, { headers });

    expect(axios.post).toBeCalledTimes(1);
    const postCallArgs = getMockContext(axios.post).calls[0];
    expect(postCallArgs[2]).toHaveProperty('headers', headers);
  });

  test('Axios response should be returned', async () => {
    const response = await postRequest(url, body);

    expect(response).toBe(stubResponse);
  });

  describe('DNS resolution', () => {
    test.todo('Host should not be resolved if it is already an IP address');

    test.todo('Host should be resolved if it is a DNS record');
  });

  test('Non-TLS URLs should be refused', async () => {
    await expectPromiseToReject(
      postRequest('http://example.com', body),
      new Error('Can only POST to HTTPS URLs (got http://example.com)'),
    );
  });

  describe('Timeout', () => {
    test('Request should time out after 3 seconds by default', async () => {
      await postRequest(url, body);

      const postCallArgs = getMockContext(axios.post).calls[0];
      expect(postCallArgs[2]).toHaveProperty('timeout', 3000);
    });

    test('A custom timeout should be accepted', async () => {
      const timeout = 4321;
      await postRequest(url, body, { timeout });

      const postCallArgs = getMockContext(axios.post).calls[0];
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
      axios.post.mockReset();
    });

    test('HTTP 307 redirect should be followed', async () => {
      jest.spyOn(axios, 'post').mockRejectedValueOnce({
        response: { ...stubRedirectResponse, status: 307 },
      });
      jest.spyOn(axios, 'post').mockResolvedValueOnce(Promise.resolve({ status: 202 }));

      await postRequest(url, body);

      expect(axios.post).toBeCalledTimes(2);
      const postCall2Args = getMockContext(axios.post).calls[1];
      expect(postCall2Args[0]).toEqual(stubRedirectUrl);
    });

    test('HTTP 308 redirect should be followed', async () => {
      jest.spyOn(axios, 'post').mockRejectedValueOnce({
        response: { ...stubRedirectResponse, status: 308 },
      });
      jest.spyOn(axios, 'post').mockResolvedValueOnce({ status: 202 });

      await postRequest(url, body);

      expect(axios.post).toBeCalledTimes(2);
      const postCall2Args = getMockContext(axios.post).calls[1];
      expect(postCall2Args[0]).toEqual(stubRedirectUrl);
    });

    test('Responses with unsupported 3XX status codes should be returned as is', async () => {
      const redirectResponse = { ...stubRedirectResponse, status: 302 };
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: redirectResponse });

      const response = await postRequest(url, body);

      expect(axios.post).toBeCalledTimes(1);
      expect(response).toBe(redirectResponse);
    });

    test('Original arguments should be honored when following redirects', async () => {
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockResolvedValueOnce({ status: 202 });

      const options = { headers: { foo: 'bar' }, timeout: 2 };
      await postRequest(url, body, options);

      expect(axios.post).toBeCalledTimes(2);
      const postCall2Args = getMockContext(axios.post).calls[1];
      expect(postCall2Args[1]).toEqual(body);
      expect(postCall2Args[2]).toEqual({ ...options, maxRedirects: 0 });
    });

    test('Redirects should be followed up to a maximum of 3 times by default', async () => {
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockResolvedValueOnce(stubResponse);

      const response = await postRequest(url, body);

      expect(response).toBe(stubResponse);
    });

    test('Exceeding the maximum number of redirects should result in error', async () => {
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });

      await expectPromiseToReject(
        postRequest(url, body),
        new HTTPSError('Reached maximum number of redirects (3)'),
      );
    });

    test('The maximum number of redirects should be customizable', async () => {
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockRejectedValueOnce({ response: stubRedirectResponse });
      jest.spyOn(axios, 'post').mockResolvedValueOnce(stubResponse);

      const response = await postRequest(url, body, { maxRedirects: 4 });

      expect(response).toBe(stubResponse);
    });
  });

  test('Unexpected axios exceptions should be rethrown', async () => {
    // @ts-ignore
    axios.post.mockReset();
    const error = new Error('Haha, in thy face');
    jest.spyOn(axios, 'post').mockRejectedValueOnce(error);

    await expectPromiseToReject(postRequest(url, body), error);
  });
});
