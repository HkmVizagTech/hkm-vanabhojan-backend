const { startDb, stopDb, clearDb, api, adminHeader, createEvent, registrationForm } = require('./helpers');
const Candidate = require('../src/models/Candidate');

// WhatsApp + file storage are mocked: the cash flow must succeed even when delivery does not.
const mockSendPass = jest.fn();
jest.mock('../src/services/qrPass.service', () => ({ sendPass: (...a) => mockSendPass(...a), png: jest.fn() }));

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  mockSendPass.mockReset();
  mockSendPass.mockResolvedValue({ status: 'submitted' });
});

const PASSWORD = 'password123';
const walkIn = (overrides = {}) => ({ name: 'Ravi Teja', whatsappNumber: '9123456780', gender: 'Male', collegeOrWorking: 'College', ...overrides });

async function setup() {
  const owner = await adminHeader();
  await createEvent(owner, { registrationOpen: false }); // the desk works even with online registration closed
  const make = async (email, canCollectCash) => {
    await api().post('/admin/users/register').set(owner).send({ name: email, email, password: PASSWORD, role: 'user', canCollectCash });
    const { body } = await api().post('/admin/users/login').send({ email, password: PASSWORD });
    return { Authorization: `Bearer ${body.token}` };
  };
  return { owner, cashier: await make('cashier@x.com', true), plain: await make('plain@x.com', false) };
}

describe('cash desk access', () => {
  it('is only open to admins and volunteers who were given the cash permission', async () => {
    const { owner, cashier, plain } = await setup();
    expect((await api().post('/users/cash/register').set(plain).send(walkIn())).status).toBe(403);
    expect((await api().get('/users/cash').set(plain)).status).toBe(403);
    expect((await api().post('/users/cash/register').send(walkIn())).status).toBe(401);
    expect((await api().post('/users/cash/register').set(cashier).send(walkIn())).status).toBe(201);
    expect((await api().post('/users/cash/register').set(owner).send(walkIn({ name: 'Other Person', whatsappNumber: '9123456781' }))).status).toBe(201);
  });

  it('lets an admin grant and revoke the permission', async () => {
    const { owner, plain } = await setup();
    const User = require('../src/models/User');
    const volunteer = await User.findOne({ email: 'plain@x.com' });
    await api().patch(`/admin/users/${volunteer._id}`).set(owner).send({ canCollectCash: true });
    expect((await api().post('/users/cash/register').set(plain).send(walkIn())).status).toBe(201);
    await api().patch(`/admin/users/${volunteer._id}`).set(owner).send({ canCollectCash: false });
    expect((await api().post('/users/cash/register').set(plain).send(walkIn({ name: 'Second', whatsappNumber: '9123456782' }))).status).toBe(403);
  });
});

describe('taking cash', () => {
  it('needs only name, number, gender and type; charges the event fee and issues a QR', async () => {
    const { owner, cashier } = await setup();
    const res = await api().post('/users/cash/register').set(cashier).send(walkIn());
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(99);
    expect(res.body.candidate).toMatchObject({ name: 'Ravi Teja', whatsappNumber: '919123456780', paymentAmount: 99, checkedIn: false });
    expect(res.body.candidate.attendanceToken).toHaveLength(32);
    expect(res.body.whatsapp.ok).toBe(true);
    expect(mockSendPass).toHaveBeenCalledTimes(1);

    const saved = await Candidate.findOne({ name: 'Ravi Teja' });
    expect(saved).toMatchObject({ paymentStatus: 'Paid', paymentMethod: 'Cash', paymentUpdatedBy: 'cash', collectedBy: 'cashier@x.com', qrSendStatus: 'sent' });

    const list = await api().get('/users').set(owner);
    expect(list.body.candidates.find(c => c.name === 'Ravi Teja').paymentMethod).toBe('Cash');
  });

  it('charges others the other fee', async () => {
    const { cashier } = await setup();
    const res = await api().post('/users/cash/register').set(cashier).send(walkIn({ collegeOrWorking: 'Working', whatsappNumber: '9123456783' }));
    expect(res.body.amount).toBe(1200);
  });

  it('rejects missing required details with a clear message', async () => {
    const { cashier } = await setup();
    for (const bad of [{ name: '' }, { whatsappNumber: '123' }, { gender: undefined }, { collegeOrWorking: undefined }]) {
      const res = await api().post('/users/cash/register').set(cashier).send(walkIn(bad));
      expect(res.status).toBe(400);
    }
    expect((await Candidate.countDocuments())).toBe(0);
  });

  it('keeps the registration and the cash even when the WhatsApp message fails', async () => {
    const { cashier } = await setup();
    mockSendPass.mockRejectedValue(new Error('WhatsApp is not configured'));
    const res = await api().post('/users/cash/register').set(cashier).send(walkIn());
    expect(res.status).toBe(201);
    expect(res.body.whatsapp).toMatchObject({ ok: false, error: 'WhatsApp is not configured' });
    expect((await Candidate.findOne({ name: 'Ravi Teja' })).qrSendStatus).toBe('failed');

    // sending again later works
    mockSendPass.mockResolvedValue({});
    const id = res.body.candidate.id;
    const retry = await api().post(`/users/cash/${id}/send-qr`).set(cashier);
    expect(retry.body.whatsapp.ok).toBe(true);
    expect((await Candidate.findById(id)).qrSendStatus).toBe('sent');
  });

  it('does not register the same person twice, and can check them in at the desk', async () => {
    const { cashier } = await setup();
    await api().post('/users/cash/register').set(cashier).send(walkIn());
    const dup = await api().post('/users/cash/register').set(cashier).send(walkIn({ name: 'ravi teja' }));
    expect(dup.status).toBe(409);

    const inNow = await api().post('/users/cash/register').set(cashier).send(walkIn({ name: 'Sita Devi', checkIn: true }));
    expect(inNow.body.candidate.checkedIn).toBe(true);
    expect(await Candidate.countDocuments({ adminAttendance: true })).toBe(1);
  });

  it('the issued QR works at the gate scan', async () => {
    const { owner, cashier } = await setup();
    const { body } = await api().post('/users/cash/register').set(cashier).send(walkIn());
    const scan = await api().post('/users/admin/attendance-scan').set(owner).send({ token: body.candidate.attendanceToken });
    expect(scan.body).toMatchObject({ status: 'success', scannedPerson: 'Ravi Teja' });
  });

  it('needs an event to exist', async () => {
    await clearDb();
    const owner = await adminHeader();
    const res = await api().post('/users/cash/register').set(owner).send(walkIn());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/event/i);
  });
});

describe('cash records', () => {
  it('shows volunteers their own cash and admins everyone\'s, with totals', async () => {
    const { owner, cashier } = await setup();
    await api().post('/users/cash/register').set(cashier).send(walkIn());
    await api().post('/users/cash/register').set(owner).send(walkIn({ name: 'By Admin', whatsappNumber: '9123456799', collegeOrWorking: 'Working' }));

    const mine = (await api().get('/users/cash').set(cashier)).body;
    expect(mine.totals).toEqual({ people: 1, amount: 99 });

    const all = (await api().get('/users/cash').set(owner)).body;
    expect(all.totals).toEqual({ people: 2, amount: 99 + 1200 });
    expect(all.registrations.map(r => r.collectedBy).sort()).toEqual(['Admin', 'cashier@x.com']); // the staff member's name
  });
});
