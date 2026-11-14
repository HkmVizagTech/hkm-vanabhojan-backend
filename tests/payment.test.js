const { startDb, stopDb, clearDb, api, adminHeader, registrationForm, workingForm, sign, createEvent } = require('./helpers');
const Candidate = require('../src/models/Candidate');
const payments = require('../src/services/payment.service');

const mockCreate = jest.fn();
jest.mock('../src/config/razorpay', () => ({
  getRazorpay: () => ({ orders: { create: (...args) => mockCreate(...args) } }),
}));

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await createEvent(await adminHeader()); // registrations need an open event
  mockCreate.mockReset();
  mockCreate.mockImplementation(async opts => ({ id: 'order_TEST1', amount: opts.amount, currency: 'INR' }));
});

describe('create-order', () => {
  it('prices the order on the server and ignores the amount sent by the browser', async () => {
    const res = await api().post('/users/create-order').send({ amount: 100, formData: workingForm() });
    expect(res.status).toBe(200);
    expect(mockCreate.mock.calls[0][0].amount).toBe(120000);

    const saved = await Candidate.findOne({ orderId: 'order_TEST1' });
    expect(saved).toMatchObject({ paymentAmount: 1200, paymentStatus: 'Pending', whatsappNumber: '919876543210' });
  });

  it('closes earlier unfinished attempts once the person has paid, and refuses a second registration', async () => {
    mockCreate.mockImplementation(async opts => ({ id: `order_${mockCreate.mock.calls.length}`, amount: opts.amount, currency: 'INR' }));
    mockCreate.mockClear();
    await api().post('/users/create-order').send({ formData: workingForm() }); // order_1, left unfinished
    await api().post('/users/create-order').send({ formData: workingForm() }); // order_2, paid
    expect(await Candidate.countDocuments({ paymentStatus: 'Pending' })).toBe(2);

    const second = await Candidate.findOne({ orderId: 'order_2' });
    await payments.markPaid(second._id, { paymentId: 'pay_2', source: 'manual' });
    const first = await Candidate.findOne({ orderId: 'order_1' });
    expect(first).toMatchObject({ paymentStatus: 'Failed', paymentFailureReason: expect.stringMatching(/replaced/i) });
    expect(await Candidate.countDocuments({ paymentStatus: 'Pending' })).toBe(0);

    // The admin list shows the person once: the leftover Failed attempt is hidden, even when filtering by Failed.
    const headers = await adminHeader();
    const shown = await api().get('/users').set(headers);
    expect(shown.body.candidates.map(c => c.paymentStatus)).toEqual(['Paid']);
    const failedOnly = await api().get('/users?paymentStatus=Failed').set(headers);
    expect(failedOnly.body.candidates).toHaveLength(0);

    const again = await api().post('/users/create-order').send({ formData: workingForm({ name: 'ARJUN rao' }) });
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already registered/i);
    expect(mockCreate).toHaveBeenCalledTimes(2); // no third Razorpay order was created
  });

  it('hides failed attempts under a differently spelled name, but not a relative with the same surname', async () => {
    const headers = await adminHeader();
    const event = (await Candidate.findOne()) || null;
    const ev = event ? event.event : (await api().get('/events').set(headers)).body.events?.[0]?._id;
    const row = (name, paymentStatus, n) => ({ ...registrationForm(), name, collegeOrWorking: 'Working', paymentStatus, orderId: `o_${n}`, event: ev, whatsappNumber: '919281247355', paymentAmount: 600 });
    await Candidate.create([row('Sanjana joshitha Balaka', 'Failed', 1), row('B.Sanjana joshitha', 'Paid', 2), row('Sanjana Rao', 'Failed', 3), row('Anil Balaka', 'Failed', 4)]);
    const names = (await api().get('/users').set(headers)).body.candidates.map(c => c.name).sort();
    expect(names).toEqual(['Anil Balaka', 'B.Sanjana joshitha', 'Sanjana Rao']);
  });

  it('lets a family share a number: a different name is a different person', async () => {
    const first = await api().post('/users/create-order').send({ formData: workingForm() });
    await payments.markPaid((await Candidate.findOne({ orderId: first.body.id }))._id, { paymentId: 'pay_F', source: 'manual' });
    const sibling = await api().post('/users/create-order').send({ formData: workingForm({ name: 'Sita Rao' }) });
    expect(sibling.status).toBe(200);
  });

  it('refuses a student registration that has no ID card', async () => {
    const res = await api().post('/users/create-order').send({ formData: registrationForm() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ID card is required/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not ask how the person heard about the festival', async () => {
    const { howDidYouKnow, ...form } = workingForm();
    expect(howDidYouKnow).toBeDefined();
    expect((await api().post('/users/create-order').send({ formData: form })).status).toBe(200);
  });

  it('rejects incomplete or invalid registrations before touching Razorpay', async () => {
    const res = await api().post('/users/create-order').send({ formData: registrationForm({ whatsappNumber: '123', college: '' }) });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('verify-payment', () => {
  const callback = (overrides = {}) => {
    const body = { razorpay_order_id: 'order_TEST1', razorpay_payment_id: 'pay_TEST1' };
    return { ...body, razorpay_signature: sign('rzp_test_secret', 'order_TEST1|pay_TEST1'), ...overrides };
  };

  beforeEach(() => api().post('/users/create-order').send({ formData: workingForm() }));

  it('confirms a correctly signed payment once, then reports it as already registered', async () => {
    const first = await api().post('/users/verify-payment').send(callback());
    expect(first.status).toBe(200);
    expect(first.body.message).toBe('success');

    const again = await api().post('/users/verify-payment').send(callback());
    expect(again.body.message).toBe('Already Registered');

    const status = await api().get('/users/verify-payment/pay_TEST1');
    expect(status.body.candidate).toMatchObject({ paymentStatus: 'Paid', name: 'Arjun Rao' });
  });

  it('rejects a forged signature and leaves the candidate pending', async () => {
    const res = await api().post('/users/verify-payment').send(callback({ razorpay_signature: 'f'.repeat(64) }));
    expect(res.status).toBe(400);
    expect((await Candidate.findOne({ orderId: 'order_TEST1' })).paymentStatus).toBe('Pending');
  });

  it('marks a payment paid exactly once even when callbacks race', async () => {
    const id = (await Candidate.findOne({ orderId: 'order_TEST1' }))._id;
    const results = await Promise.all([1, 2, 3].map(() => payments.markPaid(id, { paymentId: 'pay_TEST1', source: 'manual' })));
    expect(results.filter(r => r.changed)).toHaveLength(1);
  });
});

describe('webhook', () => {
  const send = (event, payload, signature) => {
    const raw = JSON.stringify({ event, payload });
    return api()
      .post('/users/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature ?? sign('whsec_test', raw))
      .send(raw);
  };

  beforeEach(() => api().post('/users/create-order').send({ formData: workingForm() }));

  it('marks the candidate paid on payment.captured', async () => {
    const res = await send('payment.captured', { payment: { entity: { id: 'pay_W1', order_id: 'order_TEST1', method: 'upi' } } });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('paid');
    expect(await Candidate.findOne({ orderId: 'order_TEST1' })).toMatchObject({ paymentStatus: 'Paid', paymentMethod: 'upi', paymentUpdatedBy: 'webhook' });
  });

  it('does not let a late failure override a confirmed payment', async () => {
    await send('payment.captured', { payment: { entity: { id: 'pay_W1', order_id: 'order_TEST1' } } });
    const res = await send('payment.failed', { payment: { entity: { id: 'pay_W0', order_id: 'order_TEST1' } } });
    expect(res.body.outcome).toBe('already_processed');
    expect((await Candidate.findOne({ orderId: 'order_TEST1' })).paymentStatus).toBe('Paid');
  });

  it('rejects an invalid signature', async () => {
    const res = await send('payment.captured', { payment: { entity: { id: 'x', order_id: 'order_TEST1' } } }, 'bad');
    expect(res.status).toBe(400);
  });
});

describe('admin guard', () => {
  it('keeps payment reconciliation behind admin auth', async () => {
    expect((await api().post('/users/check-pending-payments')).status).toBe(401);
    const headers = await adminHeader();
    expect((await api().post('/users/check-pending-payments').set(headers)).status).toBe(200);
  });
});
