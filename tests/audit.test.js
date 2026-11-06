const { startDb, stopDb, clearDb, api, adminHeader, createEvent } = require('./helpers');
const Candidate = require('../src/models/Candidate');

// What Razorpay "holds" for each order, keyed by order id.
let mockOrders = {};
let mockOthers = [];
jest.mock('../src/config/razorpay', () => ({
  getRazorpay: () => ({
    payments: { all: async () => ({ items: [...mockOthers] }) },
    orders: {
      fetchPayments: async id => {
        if (mockOrders[id] === 'error') throw new Error('Razorpay down');
        return { items: mockOrders[id] || [] };
      },
    },
  }),
}));

beforeAll(startDb);
afterAll(stopDb);

let headers;
let event;
beforeEach(async () => {
  await clearDb();
  mockOrders = {};
  mockOthers = [];
  headers = await adminHeader();
  event = await createEvent(headers);
});

const person = (name, order, overrides = {}) =>
  Candidate.create({ name, whatsappNumber: '919876543210', event: event._id, orderId: order, paymentAmount: 100, paymentStatus: 'Paid', paymentMethod: 'upi', ...overrides });
const captured = (id, rupees, extra = {}) => ({ id, status: 'captured', amount: rupees * 100, created_at: 1, ...extra });
const audit = async () => (await api().get('/users/admin/payments-audit').set(headers)).body;

describe('Razorpay audit', () => {
  it('reports a match when the dashboard and Razorpay agree', async () => {
    await person('A', 'order_A');
    await person('B', 'order_B', { paymentAmount: 250 });
    mockOrders = { order_A: [captured('pay_A', 100)], order_B: [captured('pay_B', 250)] };
    const result = await audit();
    expect(result).toMatchObject({ matches: true, difference: 0, dashboard: { paidOnline: 350 }, razorpay: { captured: 350, refunded: 0, net: 350 }, issues: [] });
  });

  it('reports fees, net to bank, repairs a missing payment link-up and counts unrelated payments', async () => {
    const a = await person('A', 'order_A');
    await person('B', 'order_B', { paymentAmount: 250, paymentId: 'pay_B' });
    mockOrders = { order_A: [captured('pay_A', 100, { fee: 236 })], order_B: [captured('pay_B', 250, { fee: 590 })] };
    mockOthers = [captured('pay_donation', 500, { fee: 1180 }), captured('pay_A', 100), captured('pay_seva', 1001)];
    const result = await audit();
    expect(result.razorpay).toMatchObject({ payments: 2, captured: 350, fees: 8.26, netToBank: 341.74 });
    expect(result.repaired).toBe(1); // A had no payment id stored
    expect((await Candidate.findById(a._id)).paymentId).toBe('pay_A');
    expect(result.otherPayments).toBe(2); // the donation and the other seva, not our own pay_A
    expect(result.matches).toBe(true);
  });

  it('keeps cash out of the Razorpay comparison', async () => {
    await person('Cash', undefined, { paymentMethod: 'Cash', paymentAmount: 600 });
    expect(await audit()).toMatchObject({ matches: true, dashboard: { paidOnline: 0, cash: 600 }, checked: 0 });
  });

  it('flags every kind of disagreement', async () => {
    await person('Late webhook', 'order_1', { paymentStatus: 'Pending' });
    await person('Ghost', 'order_2');
    await person('Wrong amount', 'order_3', { paymentAmount: 100 });
    await person('Refunded there', 'order_4');
    mockOrders = {
      order_1: [captured('pay_1', 100)],
      order_2: [],
      order_3: [captured('pay_3', 120)],
      order_4: [captured('pay_4', 100, { status: 'refunded', amount_refunded: 100 })],
    };
    const result = await audit();
    const byName = Object.fromEntries(result.issues.map(i => [i.name, i.type]));
    expect(byName).toEqual({
      'Late webhook': 'captured_not_marked_paid',
      Ghost: 'not_captured_at_razorpay',
      'Wrong amount': 'amount_differs',
      'Refunded there': 'refunded_at_razorpay_only',
    });
    expect(result.matches).toBe(false);
    expect(result.razorpay).toMatchObject({ captured: 320, refunded: 100, net: 220 });
    expect(result.dashboard.paidOnline).toBe(300);
  });

  it('reports a failed lookup instead of guessing', async () => {
    await person('A', 'order_A');
    mockOrders = { order_A: 'error' };
    const result = await audit();
    expect(result.issues[0]).toMatchObject({ type: 'lookup_failed' });
    expect(result.matches).toBe(false);
  });

  it('is admin only', async () => {
    expect((await api().get('/users/admin/payments-audit')).status).toBe(401);
  });
});
