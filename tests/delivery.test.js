const { startDb, stopDb, clearDb, createEvent, adminHeader } = require('./helpers');
const Candidate = require('../src/models/Candidate');

const mockSendPass = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../src/services/qrPass.service', () => ({ sendPass: (...a) => mockSendPass(...a), png: jest.fn() }));
jest.mock('../src/services/whatsapp.service', () => ({
  notifyRegistrationConfirmed: (...a) => mockConfirm(...a),
  notifyAccepted: jest.fn(),
  notifyRejected: jest.fn(),
  sendReminder: jest.fn(),
  sendTemplateTo: jest.fn(),
}));
const payments = require('../src/services/payment.service');
const candidates = require('../src/services/candidate.service');

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  mockSendPass.mockReset().mockResolvedValue({});
  mockConfirm.mockReset();
});

let event;
const pending = async overrides => {
  event = event || (await createEvent(await adminHeader(), {}));
  return Candidate.create({ name: 'Test', whatsappNumber: '919876543210', gender: 'Male', paymentStatus: 'Pending', paymentAmount: 99, event: event._id || event.id, ...overrides });
};
const pay = c => payments.markPaid(c._id, { paymentId: `pay_${c._id}`, source: 'manual' });

describe('who gets the QR, and when', () => {
  it('confirms a working professional and sends their QR straight after payment', async () => {
    await pay(await pending({ collegeOrWorking: 'Working' }));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockSendPass).toHaveBeenCalledTimes(1);
    expect((await Candidate.findOne()).qrSendStatus).toBe('sent');
  });

  it('records a failed QR send so it can be retried, without losing the confirmation', async () => {
    mockSendPass.mockRejectedValue(new Error('provider down'));
    await pay(await pending({ collegeOrWorking: 'Working' }));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect((await Candidate.findOne()).qrSendStatus).toBe('failed');
  });

  it('holds an online student\'s QR until an admin approves their ID', async () => {
    const student = await pending({ collegeOrWorking: 'College' });
    await pay(student);
    expect(mockSendPass).not.toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledTimes(1);

    await candidates.accept(student._id);
    expect(mockSendPass).toHaveBeenCalledTimes(1);
    expect((await Candidate.findOne()).qrSendStatus).toBe('sent');
  });
});

describe('rejecting a student', () => {
  const paidStudent = overrides => pending({ collegeOrWorking: 'College', paymentStatus: 'Paid', paymentMethod: 'upi', paymentId: 'pay_X', ...overrides });

  it('refunds an online payment and keeps the rejection visible', async () => {
    const refund = jest.spyOn(payments, 'refund').mockImplementation(async c => {
      Object.assign(c, { paymentStatus: 'Refunded', adminAction: 'Refunded' });
      await c.save();
      return { candidate: c };
    });
    const result = await candidates.reject((await paidStudent())._id);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(result.refund).toBe('processed');
    expect(await Candidate.findOne()).toMatchObject({ paymentStatus: 'Refunded', adminAction: 'Rejected' });
    refund.mockRestore();
  });

  it('still rejects when the refund fails, and says so', async () => {
    const refund = jest.spyOn(payments, 'refund').mockRejectedValue(new Error('Razorpay down'));
    const result = await candidates.reject((await paidStudent())._id);
    expect(result).toMatchObject({ refund: 'failed', refundError: 'Razorpay down' });
    expect(await Candidate.findOne()).toMatchObject({ paymentStatus: 'Paid', adminAction: 'Rejected' });
    refund.mockRestore();
  });

  it('does not try to refund a cash payment', async () => {
    const refund = jest.spyOn(payments, 'refund');
    const result = await candidates.reject((await paidStudent({ paymentMethod: 'Cash' }))._id);
    expect(result.refund).toBe('skipped');
    expect(refund).not.toHaveBeenCalled();
    refund.mockRestore();
  });
});
