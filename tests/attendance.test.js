const { startDb, stopDb, clearDb, api, adminHeader } = require('./helpers');
const Candidate = require('../src/models/Candidate');
const { normalizePhone } = require('../src/utils/phone');

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const paid = (name, overrides = {}) =>
  Candidate.create({ name, whatsappNumber: '919876543210', paymentAmount: 99, paymentStatus: 'Paid', gender: 'Male', college: 'GITAM', ...overrides });

describe('phone normalisation', () => {
  it.each([
    ['9876543210', '919876543210'],
    ['919876543210', '919876543210'],
    ['+91 98765-43210', '919876543210'],
    ['09876543210', '919876543210'],
    ['12345', null],
    ['', null],
  ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected));
});

describe('get-qr-codes', () => {
  it('returns a token for every paid registration under the number without marking attendance', async () => {
    await paid('Arjun');
    await paid('Sita', { gender: 'Female' });
    const res = await api().post('/users/get-qr-codes').send({ whatsappNumber: '9876543210' });
    expect(res.status).toBe(200);
    expect(res.body.totalCandidates).toBe(2);
    expect(res.body.candidates.every(c => c.attendanceToken && c.isAttended === false)).toBe(true);

    const again = await api().post('/users/get-qr-codes').send({ whatsappNumber: '9876543210' });
    expect(again.body.candidates.map(c => c.attendanceToken).sort()).toEqual(res.body.candidates.map(c => c.attendanceToken).sort());
  });

  it('distinguishes unregistered numbers from unpaid registrations', async () => {
    expect((await api().post('/users/get-qr-codes').send({ whatsappNumber: '9000000000' })).status).toBe(404);
    await paid('Pending Pat', { whatsappNumber: '919111111111', paymentStatus: 'Pending' });
    expect((await api().post('/users/get-qr-codes').send({ whatsappNumber: '9111111111' })).status).toBe(403);
    expect((await api().post('/users/get-qr-codes').send({ whatsappNumber: '12' })).status).toBe(400);
  });
});

describe('gate scan', () => {
  const tokenFor = async name => {
    await api().post('/users/get-qr-codes').send({ whatsappNumber: '9876543210' });
    return (await Candidate.findOne({ name })).attendanceToken;
  };

  it('marks the scanned person, flags repeats, and lists the whole family', async () => {
    await paid('Arjun');
    await paid('Sita', { gender: 'Female' });
    const headers = await adminHeader();
    const token = await tokenFor('Arjun');

    const first = await api().post('/users/admin/attendance-scan').set(headers).send({ token });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'success', scannedPerson: 'Arjun', totalMembers: 2, newlyScanned: 1 });
    expect(first.body.familyMembers.find(m => m.name === 'Arjun').wasAlreadyScanned).toBe(false);
    expect(first.body.familyMembers.find(m => m.name === 'Sita').wasAlreadyScanned).toBe(false);

    const second = await api().post('/users/admin/attendance-scan').set(headers).send({ token });
    expect(second.body.status).toBe('already-marked');
    expect(second.body.familyMembers.find(m => m.name === 'Arjun').wasAlreadyScanned).toBe(true);

    const list = await api().get('/users/admin/scanned-list').set(headers);
    expect(list.body.total).toBe(1);
  });

  it('counts a QR scanned simultaneously by two volunteers only once', async () => {
    await paid('Arjun');
    const headers = await adminHeader();
    const token = await tokenFor('Arjun');
    const results = await Promise.all([1, 2, 3].map(() => api().post('/users/admin/attendance-scan').set(headers).send({ token })));
    expect(results.filter(r => r.body.status === 'success')).toHaveLength(1);
  });

  it('rejects unknown QR codes, unpaid registrations and anonymous callers', async () => {
    const headers = await adminHeader();
    expect((await api().post('/users/admin/attendance-scan').set(headers).send({ token: 'nope' })).status).toBe(404);

    await paid('Refunded Ravi', { paymentStatus: 'Refunded', attendanceToken: 'tok-refunded' });
    expect((await api().post('/users/admin/attendance-scan').set(headers).send({ token: 'tok-refunded' })).status).toBe(403);

    expect((await api().post('/users/admin/attendance-scan').send({ token: 'x' })).status).toBe(401);
  });
});

describe('colleges', () => {
  it('is publicly readable but only admins can change it, and names are unique ignoring case', async () => {
    const app = api();
    expect((await app.post('/college').send({ name: 'GITAM' })).status).toBe(401);
    const headers = await adminHeader(app);
    expect((await app.post('/college').set(headers).send({ name: 'GITAM' })).status).toBe(201);
    expect((await app.post('/college').set(headers).send({ name: 'gitam' })).status).toBe(409);
    const list = await app.get('/college');
    expect(list.body.map(c => c.name)).toEqual(['GITAM']);
  });

  it('bulk-adds a pasted list, skipping duplicates and names that already exist', async () => {
    const app = api();
    const headers = await adminHeader(app);
    await app.post('/college').set(headers).send({ name: 'GITAM' });
    const res = await app.post('/college/bulk').set(headers).send({ names: ['gitam', 'Vignan', 'VIGNAN', 'Raghu Engineering'] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ created: 2, skipped: 2 });
    expect((await app.get('/college')).body.map(c => c.name)).toEqual(['GITAM', 'Raghu Engineering', 'Vignan']);
    expect((await app.post('/college/bulk').send({ names: ['X'] })).status).toBe(401);
  });
});
