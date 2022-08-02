import { deliverParcel } from '..';

test('Real public gateway should refuse malformed parcel', async () => {
  await expect(
    deliverParcel('frankfurt.relaycorp.cloud', Buffer.from('hey')),
  ).rejects.toMatchObject(expect.objectContaining({ message: expect.stringMatching('HTTP 400') }));
});
