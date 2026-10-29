const { startDb, stopDb, clearDb, api } = require('./helpers');

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const PASSWORD = 'password123';
const app = () => api();
const bearer = token => ({ Authorization: `Bearer ${token}` });

async function login(email) {
  const res = await app().post('/admin/users/login').send({ email, password: PASSWORD });
  return { status: res.status, body: res.body, headers: res.body.token ? bearer(res.body.token) : {} };
}

/** super admin (first account) + an admin "boss" + a volunteer "gate", all created the normal way. */
async function setup() {
  await app().post('/admin/users/register').send({ name: 'Owner', email: 'owner@example.com', password: PASSWORD });
  const owner = (await login('owner@example.com')).headers;
  const create = (name, email, role) => app().post('/admin/users/register').set(owner).send({ name, email, password: PASSWORD, role });
  const boss = (await create('Boss', 'boss@example.com', 'admin')).body.user;
  const gate = (await create('Gate', 'gate@example.com', 'user')).body.user;
  return { owner, boss, gate, bossHeaders: (await login('boss@example.com')).headers };
}

describe('super admin', () => {
  it('is the first account, is reported as super admin, and never appears in the staff list', async () => {
    const { owner, boss, gate } = await setup();
    const me = await app().post('/admin/users/validate-token').set(owner);
    expect(me.body.user.isSuperAdmin).toBe(true);

    const list = await app().get('/admin/users').set(owner);
    expect(list.body.user.map(u => u.email).sort()).toEqual(['boss@example.com', 'gate@example.com']);
    expect(list.body.user.some(u => u.email === 'owner@example.com')).toBe(false);
    expect([boss.role, gate.role]).toEqual(['admin', 'user']);
  });

  it('cannot be disabled, deleted or even found by anyone else', async () => {
    const { bossHeaders } = await setup();
    const User = require('../src/models/User');
    const ownerDoc = await User.findOne({ email: 'owner@example.com' });
    expect((await app().patch(`/admin/users/${ownerDoc._id}`).set(bossHeaders).send({ active: false })).status).toBe(404);
    expect((await app().delete(`/admin/users/${ownerDoc._id}`).set(bossHeaders)).status).toBe(404);
  });
});

describe('who can create and manage whom', () => {
  it('lets only the super admin create admins; regular admins create volunteers', async () => {
    const { bossHeaders } = await setup();
    const asBoss = role => app().post('/admin/users/register').set(bossHeaders).send({ name: 'New', email: `${role}@x.com`, password: PASSWORD, role });
    expect((await asBoss('admin')).status).toBe(403);
    expect((await asBoss('user')).status).toBe(201);
  });

  it('lets admins disable, enable and delete volunteers, but not other admins', async () => {
    const { bossHeaders, gate, owner, boss } = await setup();
    const patch = (id, body, h = bossHeaders) => app().patch(`/admin/users/${id}`).set(h).send(body);

    expect((await patch(gate._id, { active: false })).body.user.active).toBe(false);
    expect((await patch(gate._id, { active: true })).body.user.active).toBe(true);
    expect((await app().delete(`/admin/users/${gate._id}`).set(bossHeaders)).status).toBe(200);

    // an admin may not touch another admin; the super admin may
    const second = (await app().post('/admin/users/register').set(owner).send({ name: 'Two', email: 'two@example.com', password: PASSWORD, role: 'admin' })).body.user;
    expect((await patch(second._id, { active: false })).status).toBe(403);
    expect((await app().delete(`/admin/users/${second._id}`).set(bossHeaders)).status).toBe(403);
    expect((await patch(second._id, { active: false }, owner)).status).toBe(200);
    expect(boss.email).toBe('boss@example.com');
  });

  it('does not let anyone change their own account, and volunteers have no access', async () => {
    const { bossHeaders, boss, gate } = await setup();
    expect((await app().patch(`/admin/users/${boss._id}`).set(bossHeaders).send({ active: false })).status).toBe(400);
    expect((await app().delete(`/admin/users/${boss._id}`).set(bossHeaders)).status).toBe(400);

    const volunteer = (await login('gate@example.com')).headers;
    expect((await app().get('/admin/users').set(volunteer)).status).toBe(403);
    expect((await app().patch(`/admin/users/${boss._id}`).set(volunteer).send({ active: false })).status).toBe(403);
    expect(gate.email).toBe('gate@example.com');
  });

  it('only the super admin can promote someone to admin', async () => {
    const { bossHeaders, gate, owner } = await setup();
    expect((await app().patch(`/admin/users/${gate._id}`).set(bossHeaders).send({ role: 'admin' })).status).toBe(403);
    expect((await app().patch(`/admin/users/${gate._id}`).set(owner).send({ role: 'admin' })).body.user.role).toBe('admin');
  });
});

describe('disabled accounts', () => {
  it('cannot sign in, and a session opened earlier stops working at once', async () => {
    const { bossHeaders, gate } = await setup();
    const before = await login('gate@example.com');
    expect(before.status).toBe(200);

    await app().patch(`/admin/users/${gate._id}`).set(bossHeaders).send({ active: false });

    const again = await login('gate@example.com');
    expect(again.status).toBe(403);
    expect(again.body.message).toMatch(/disabled/i);
    const old = await app().post('/admin/users/validate-token').set(before.headers);
    expect(old.status).toBe(403);

    await app().patch(`/admin/users/${gate._id}`).set(bossHeaders).send({ active: true });
    expect((await login('gate@example.com')).status).toBe(200);
  });
});
