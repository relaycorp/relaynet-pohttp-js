import axios from 'axios';
import { postRequest } from '../lib/wrappers/https';
import { getMockContext } from '../lib/_test_utils';

afterEach(() => {
  jest.restoreAllMocks();
});

test('307 redirect', async () => {
  jest.spyOn(axios, 'post');

  await postRequest('https://httpstat.us/307', Buffer.from('hey'));

  expect(axios.post).toBeCalledTimes(2);
  const postCall2Args = getMockContext(axios.post).calls[1];
  expect(postCall2Args[0]).toEqual('https://httpstat.us');
});
