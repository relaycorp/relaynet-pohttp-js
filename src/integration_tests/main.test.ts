import { deliverParcel } from '..';

test('307 redirect', async () => {
  const response = await deliverParcel('https://httpstat.us/307', Buffer.from('hey'));

  expect(response).toHaveProperty('config.url', 'https://httpstat.us');
  expect(response.request).toHaveProperty('shouldKeepAlive', true);
});
