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

describe('GET /integrations/person', () => {
  const get = (phone) => api().get('/integrations/person?phone=' + phone).set('x-api-key', env.INTEGRATION_API_KEY);

  it('needs the API key and a valid number', async () => {
    expect((await api().get('/integrations/person?phone=9876543210')).status).toBe(401);
    expect((await get('123')).status).toBe(400);
  });

  it('unknown number -> found:false', async () => {
    const res = await get('9876543210');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ found: false, attended: false, person: null });
  });

  it('known but never scanned in -> found, NOT attended, details to pre-fill', async () => {
    await person('Meena Rao', '919876543210', { gender: 'Female', college: 'AU', course: 'B.Tech', year: '3rd Year', dob: new Date('2004-01-01') });
    const res = await get('9876543210');
    expect(res.body.found).toBe(true);
    expect(res.body.attended).toBe(false);
    expect(res.body.person).toMatchObject({ name: 'Meena Rao', gender: 'Female', college: 'AU', course: 'B.Tech', year: '3rd Year' });
    expect(res.body.person.age).toBeGreaterThan(15);
  });

  it('paid and scanned in (either way) -> attended', async () => {
    await person('Arjun', '919876543210', { attendance: true });
    expect((await get('9876543210')).body.attended).toBe(true);
    await person('Sita', '919123456780', { adminAttendance: true });
    expect((await get('9123456780')).body.attended).toBe(true);
  });

  it('scanned in but never paid does not count as attended', async () => {
    await person('Unpaid', '919000000002', { attendance: true, paymentStatus: 'Pending' });
    const res = await get('9000000002');
    expect(res.body.found).toBe(true);
    expect(res.body.attended).toBe(false);
  });

  it('shares only what the form needs (no email, dob, ID or payment data)', async () => {
    await person('Arjun', '919876543210', { email: 'a@b.com', dob: new Date('2003-05-05'), studentIdCardKey: 'secret/key' });
    const res = await get('9876543210');
    expect(Object.keys(res.body.person).sort()).toEqual(['age', 'college', 'course', 'gender', 'name', 'year']);
    const text = JSON.stringify(res.body);
    for (const leak of ['a@b.com', 'secret/key', 'paymentAmount']) expect(text.includes(leak)).toBe(false);
  });
});
