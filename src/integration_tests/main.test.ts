import { deliverParcel } from '..';

// TODO: Reinstate
test.skip('Real public gateway should refuse malformed parcel', async () => {
  await expect(
    deliverParcel('https://frankfurt.relaycorp.cloud', Buffer.from('hey')),
  ).rejects.toMatchObject(expect.objectContaining({ message: expect.stringMatching('HTTP 400') }));
});
