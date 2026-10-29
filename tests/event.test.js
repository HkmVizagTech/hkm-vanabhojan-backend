const { startDb, stopDb, clearDb, api, adminHeader, registrationForm, createEvent, eventPayload } = require('./helpers');
const Candidate = require('../src/models/Candidate');

jest.mock('../src/config/razorpay', () => ({
  getRazorpay: () => ({ orders: { create: async o => ({ id: `order_${Date.now()}_${Math.random()}`, amount: o.amount, currency: 'INR' }) } }),
}));

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const paid = (event, name, phone, extra = {}) =>
  Candidate.create({
    event: event._id || event.id, name, whatsappNumber: phone, paymentAmount: 99, paymentStatus: 'Paid',
    collegeOrWorking: 'College', college: 'GITAM', ...extra,
  });

describe('events', () => {
  it('lets only admins manage events; the current event is public', async () => {
    const app = api();
    expect((await app.post('/events').send(eventPayload())).status).toBe(401);
    const headers = await adminHeader(app);

    expect((await app.get('/events/current')).body.event).toBeNull();

    const first = await createEvent(headers);
    expect(first.isCurrent).toBe(true); // the first edition goes live automatically

    const current = await app.get('/events/current');
    expect(current.body.event).toMatchObject({ name: 'Vanabhojanam 2026', fees: { college: 99, working: 1200 }, registrationOpen: true });
    expect(current.body.event.isCurrent).toBeUndefined();
  });

  it('keeps exactly one current event', async () => {
    const app = api();
    const headers = await adminHeader(app);
    const a = await createEvent(headers, { name: 'V 2026' });
    const b = await createEvent(headers, { name: 'V 2027', date: '2027-11-07' });
    expect(b.isCurrent).toBe(false);

    await app.post(`/events/${b._id}/set-current`).set(headers);
    const list = await app.get('/events').set(headers);
    expect(list.body.events.filter(e => e.isCurrent).map(e => e.name)).toEqual(['V 2027']);
    expect(a.name).toBe('V 2026');
  });

  it('validates fees and age range', async () => {
    const headers = await adminHeader();
    const bad = await api().post('/events').set(headers).send(eventPayload({ fees: { college: 0, working: 1200 } }));
    expect(bad.status).toBe(400);
    const age = await api().post('/events').set(headers).send(eventPayload({ ageMin: 40, ageMax: 20 }));
    expect(age.status).toBe(400);
  });

  it('refuses to delete an event that has registrations', async () => {
    const headers = await adminHeader();
    const event = await createEvent(headers);
    await paid(event, 'Arjun', '919876543210');
    const res = await api().delete(`/events/${event._id}`).set(headers);
    expect(res.status).toBe(409);
    const empty = await createEvent(headers, { name: 'Empty', date: '2030-01-01' });
    expect((await api().delete(`/events/${empty._id}`).set(headers)).status).toBe(200);
  });
});

describe('registration uses the current event', () => {
  it('charges the fees of the current event and links the registration to it', async () => {
    const headers = await adminHeader();
    const event = await createEvent(headers, { fees: { college: 149, working: 1500 } });
    const res = await api().post('/users/create-order').send({ amount: 1, formData: registrationForm() });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(14900);
    const saved = await Candidate.findOne({ orderId: res.body.id });
    expect(String(saved.event)).toBe(String(event._id));
    expect(saved.paymentAmount).toBe(149);
  });

  it('is refused while registration is closed or no event exists', async () => {
    const none = await api().post('/users/create-order').send({ formData: registrationForm() });
    expect(none.status).toBe(409);

    const headers = await adminHeader();
    const event = await createEvent(headers, { registrationOpen: false });
    const closed = await api().post('/users/create-order').send({ formData: registrationForm() });
    expect(closed.status).toBe(409);
    expect(closed.body.message).toMatch(/closed/i);

    await api().put(`/events/${event._id}`).set(headers).send(eventPayload({ registrationOpen: true }));
    expect((await api().post('/users/create-order').send({ formData: registrationForm() })).status).toBe(200);
  });

  it('filters candidate lists by event (default: current) and QR codes show only the current edition', async () => {
    const headers = await adminHeader();
    const y2025 = await createEvent(headers, { name: 'V 2025', date: '2025-11-09' });
    await paid(y2025, 'Old Olga', '919000000001');
    const y2026 = await createEvent(headers, { name: 'V 2026', date: '2026-11-08' });
    await api().post(`/events/${y2026._id}/set-current`).set(headers);
    await paid(y2026, 'New Nikhil', '919000000002');

    const names = async q => (await api().get(`/users${q}`).set(headers)).body.candidates.map(c => c.name).sort();
    expect(await names('')).toEqual(['New Nikhil']);
    expect(await names('?event=all')).toEqual(['New Nikhil', 'Old Olga']);
    expect(await names(`?event=${y2025._id}`)).toEqual(['Old Olga']);

    expect((await api().post('/users/get-qr-codes').send({ whatsappNumber: '9000000001' })).status).toBe(404);
    expect((await api().post('/users/get-qr-codes').send({ whatsappNumber: '9000000002' })).status).toBe(200);
  });
});

describe('analytics and follow-up', () => {
  async function twoYears() {
    const headers = await adminHeader();
    const y1 = await createEvent(headers, { name: 'V 2025', date: '2025-11-09' });
    const y2 = await createEvent(headers, { name: 'V 2026', date: '2026-11-08' });
    await paid(y1, 'Anu', '919000000001', { adminAttendance: true });
    await paid(y1, 'Anu Sister', '919000000001', { adminAttendance: true }); // same family number
    await paid(y1, 'Bhanu', '919000000002', { adminAttendance: true });
    await paid(y1, 'Chitra', '919000000003'); // paid but did not come
    await paid(y1, 'Dev', '919000000004', { adminAttendance: true, collegeOrWorking: 'Working', paymentAmount: 1200 });
    await paid(y2, 'Anu', '919000000001', { adminAttendance: true }); // came back
    return { headers, y1, y2 };
  }

  it('compares editions and counts returning people', async () => {
    const { headers } = await twoYears();
    const { body } = await api().get('/events/analytics').set(headers);
    const [a, b] = body.events;
    expect(a).toMatchObject({ name: 'V 2025', paid: 5, attended: 4, students: 4, others: 1, uniquePeople: 4, returning: 0, attendanceRate: 80 });
    expect(a.revenue).toBe(99 * 4 + 1200);
    expect(b).toMatchObject({ name: 'V 2026', paid: 1, uniquePeople: 1, returning: 1 });
  });

  it('lists last year\'s attendees who have not registered yet, one row per number', async () => {
    const { headers, y1, y2 } = await twoYears();
    const q = audience => api().get(`/events/followup?from=${y1._id}&to=${y2._id}&audience=${audience}`).set(headers);

    const attended = (await q('attended')).body;
    expect(attended.people.map(p => p.phone).sort()).toEqual(['919000000002', '919000000004']); // 919000000001 already registered for 2026
    expect(attended.alreadyRegistered).toBe(1);

    const noShow = (await q('no_show')).body;
    expect(noShow.people.map(p => p.names[0])).toEqual(['Chitra']);

    const family = (await q('registered')).body;
    expect(family.total).toBe(4);
  });

  it('only sends WhatsApp invitations when a template is configured', async () => {
    const { headers, y1, y2 } = await twoYears();
    const res = await api().post('/events/followup/send').set(headers).send({ from: y1._id, to: y2._id, audience: 'attended' });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/WA_TEMPLATE_FOLLOWUP/);
  });

  it('attaches legacy registrations (no event) to a chosen event', async () => {
    const headers = await adminHeader();
    const event = await createEvent(headers);
    await Candidate.create({ name: 'Legacy', whatsappNumber: '919111111111', paymentAmount: 99, paymentStatus: 'Paid' });
    const res = await api().post(`/events/${event._id}/adopt-legacy`).set(headers);
    expect(res.body.adopted).toBe(1);
    expect((await Candidate.findOne({ name: 'Legacy' })).event.toString()).toBe(event._id);
  });
});
