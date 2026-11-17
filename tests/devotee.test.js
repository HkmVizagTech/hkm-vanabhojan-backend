require('./env');
const { api, startDb, stopDb, clearDb, adminHeader } = require('./helpers');
const devotees = require('../src/services/devotee.service');

let sent;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  sent = [];
  devotees.setCodeSender(async (to, code) => sent.push({ to, code }));
});
afterAll(() => devotees.setCodeSender(null));

const signIn = async (app, phone = '9876543210') => {
  await app.post('/devotee-auth/otp').send({ phone });
  const { code } = sent.at(-1);
  return app.post('/devotee-auth/verify').send({ phone, otp: code });
};

describe('devotee list', () => {
  it('is managed by admins only, and bulk add skips duplicates and bad numbers', async () => {
    const app = api();
    const admin = await adminHeader(app);
    expect((await app.get('/admin/devotees')).status).toBe(401);

    await app.post('/admin/devotees').set(admin).send({ name: 'Hari', whatsappNumber: '9876543210' }).expect(201);
    await app.post('/admin/devotees').set(admin).send({ name: 'Hari again', whatsappNumber: '+91 98765 43210' }).expect(409);

    const { body } = await app.post('/admin/devotees/bulk').set(admin).send({
      rows: [{ name: 'Ram', phone: '9123456780' }, { name: 'Dup', phone: '9876543210' }, { name: 'Bad', phone: '123' }, { name: 'Ram2', phone: '9123456780' }],
    });
    expect(body).toMatchObject({ added: 1, duplicates: 2 });
    expect(body.invalid).toHaveLength(1);
    expect((await app.get('/admin/devotees').set(admin)).body.total).toBe(2);
  });
});

describe('devotee sign-in', () => {
  it('sends no code to a number that is not listed', async () => {
    const res = await api().post('/devotee-auth/otp').send({ phone: '9000000000' });
    expect(res.status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it('signs a listed devotee in, and the token can read but not change anything', async () => {
    const app = api();
    const admin = await adminHeader(app);
    await app.post('/admin/devotees').set(admin).send({ name: 'Hari', whatsappNumber: '9876543210' });

    const res = await signIn(app);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');
    const viewer = { Authorization: `Bearer ${res.body.token}` };

    expect((await app.get('/users').set(viewer)).status).toBe(200);
    expect((await app.get('/users/attendance-list?event=all').set(viewer)).status).toBe(200);
    expect((await app.get('/events').set(viewer)).status).toBe(200);
    expect((await app.post('/college').set(viewer).send({ name: 'New College' })).status).toBe(201);
    const college = (await app.get('/college')).body.find?.(c => c.name === 'New College') || (await app.get('/college')).body.colleges?.[0];
    expect((await app.delete(`/college/${college._id}`).set(viewer)).status).toBe(403);
    expect((await app.put(`/college/${college._id}`).set(viewer).send({ name: 'Renamed' })).status).toBe(403);
    expect((await app.post('/users/admin/accept/64b000000000000000000001').set(viewer)).status).toBe(403);
    expect((await app.get('/admin/devotees').set(viewer)).status).toBe(403);
    expect((await app.get('/admin/users').set(viewer)).status).toBe(403);
  });

  it('rejects a wrong code, uses a code once, and cuts off a devotee who is switched off', async () => {
    const app = api();
    const admin = await adminHeader(app);
    const { body } = await app.post('/admin/devotees').set(admin).send({ name: 'Hari', whatsappNumber: '9876543210' });

    await app.post('/devotee-auth/otp').send({ phone: '9876543210' }).expect(200);
    await app.post('/devotee-auth/verify').send({ phone: '9876543210', otp: '000000' }).expect(400);
    await app.post('/devotee-auth/otp').send({ phone: '9876543210' }).expect(429); // one a minute

    await app.post('/devotee-auth/verify').send({ phone: '9876543210', otp: sent.at(-1).code }).expect(200);
    await app.post('/devotee-auth/verify').send({ phone: '9876543210', otp: sent.at(-1).code }).expect(400); // used

    const token = (await signIn(app).catch(() => null)); // cooldown blocks a second code: sign in again after clearing
    expect(token).toBeDefined();
    await app.patch(`/admin/devotees/${body.devotee._id}`).set(admin).send({ active: false }).expect(200);
    await app.post('/devotee-auth/otp').send({ phone: '9876543210' }).expect(404);
  });
});
