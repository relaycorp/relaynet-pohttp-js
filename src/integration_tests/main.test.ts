import { deliverParcel } from '..';

test('Real public gateway should refuse malformed parcel', async () => {
  await expect(
    deliverParcel('belgium.relaycorp.services', Buffer.from('hey')),
  ).rejects.toMatchObject(expect.objectContaining({ message: expect.stringMatching('HTTP 400') }));
});
