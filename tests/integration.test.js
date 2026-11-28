const { startDb, stopDb, clearDb, api } = require('./helpers');
const Candidate = require('../src/models/Candidate');
const { env } = require('../src/config/env');

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const person = (name, phone, overrides = {}) =>
  Candidate.create({ name, whatsappNumber: phone, paymentAmount: 99, paymentStatus: 'Paid', gender: 'Male', college: 'GITAM', ...overrides });

describe('GET /integrations/attendees', () => {
  it('needs the API key', async () => {
    expect((await api().get('/integrations/attendees')).status).toBe(401);
    expect((await api().get('/integrations/attendees').set('x-api-key', 'wrong')).status).toBe(401);
  });

  it('returns only people who paid AND attended, as name + 10-digit phone, one per number', async () => {
    await person('Arjun', '919876543210', { attendance: true });
    await person('Sita', '919123456780', { adminAttendance: true });
    await person('Arjun (older)', '919876543210', { attendance: true, registrationDate: new Date('2020-01-01') });
    await person('Registered only', '919000000001'); // never turned up
    await person('Unpaid', '919000000002', { attendance: true, paymentStatus: 'Pending' });

    const res = await api().get('/integrations/attendees').set('x-api-key', env.INTEGRATION_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const byPhone = Object.fromEntries(res.body.attendees.map(a => [a.phone, a.name]));
    expect(byPhone).toEqual({ '9876543210': 'Arjun', '9123456780': 'Sita' });
  });

  it('?who=paid returns everyone who paid (not only those scanned in)', async () => {
    await person('Arjun', '919876543210', { attendance: true });
    await person('Registered only', '919000000001');
    await person('Unpaid', '919000000002', { paymentStatus: 'Pending' });
    const res = await api().get('/integrations/attendees?who=paid').set('x-api-key', env.INTEGRATION_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.attendees.map(a => a.phone).sort()).toEqual(['9000000001', '9876543210']);
    expect((await api().get('/integrations/attendees?who=everyone').set('x-api-key', env.INTEGRATION_API_KEY)).status).toBe(400);
  });

  it('rejects a malformed event id', async () => {
    const res = await api().get('/integrations/attendees?event=nope').set('x-api-key', env.INTEGRATION_API_KEY);
    expect(res.status).toBe(400);
  });
});
