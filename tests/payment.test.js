const { startDb, stopDb, clearDb, api, adminHeader, registrationForm, sign, createEvent } = require('./helpers');
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
    const res = await api().post('/users/create-order').send({ amount: 100, formData: registrationForm() });
    expect(res.status).toBe(200);
    expect(mockCreate.mock.calls[0][0].amount).toBe(9900);

    const saved = await Candidate.findOne({ orderId: 'order_TEST1' });
    expect(saved).toMatchObject({ paymentAmount: 99, paymentStatus: 'Pending', whatsappNumber: '919876543210' });
  });

  it('charges working professionals the professional fee', async () => {
    await api()
      .post('/users/create-order')
      .send({ formData: registrationForm({ collegeOrWorking: 'Working', companyName: 'TCS', college: '', course: '', year: '' }) });
    expect(mockCreate.mock.calls[0][0].amount).toBe(120000);
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

  beforeEach(() => api().post('/users/create-order').send({ formData: registrationForm() }));

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

  beforeEach(() => api().post('/users/create-order').send({ formData: registrationForm() }));

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
