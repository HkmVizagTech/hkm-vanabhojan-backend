const { startDb, stopDb, clearDb, api, adminHeader } = require('./helpers');

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('auth', () => {
  it('makes the first registered account an admin and locks registration afterwards', async () => {
    const app = api();
    const first = await app.post('/admin/users/register').send({ name: 'Root', email: 'root@example.com', password: 'password123' });
    expect(first.status).toBe(201);
    expect(first.body.user.role).toBe('admin');
    expect(first.body.user.password).toBeUndefined();

    const anon = await app.post('/admin/users/register').send({ name: 'Eve', email: 'eve@example.com', password: 'password123' });
    expect(anon.status).toBe(403);

    const login = await app.post('/admin/users/login').send({ email: 'root@example.com', password: 'password123' });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const staff = await app.post('/admin/users/register').set(headers).send({ name: 'Gate', email: 'gate@example.com', password: 'password123', role: 'user' });
    expect(staff.status).toBe(201);
    expect(staff.body.user.role).toBe('user');
  });

  it('rejects bad credentials with the same message for unknown emails and wrong passwords', async () => {
    const app = api();
    await adminHeader(app);
    const wrong = await app.post('/admin/users/login').send({ email: 'admin@example.com', password: 'nope-nope' });
    const unknown = await app.post('/admin/users/login').send({ email: 'ghost@example.com', password: 'password123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('validates tokens and never leaks password hashes from the user list', async () => {
    const app = api();
    const headers = await adminHeader(app);
    const check = await app.post('/admin/users/validate-token').set(headers);
    expect(check.status).toBe(200);
    expect(check.body.user).toMatchObject({ email: 'admin@example.com', role: 'admin' });

    const list = await app.get('/admin/users').set(headers);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toMatch(/password|\$2[aby]\$/);

    expect((await app.get('/admin/users')).status).toBe(401);
    expect((await app.post('/admin/users/validate-token').set('Authorization', 'Bearer garbage')).status).toBe(403);
  });

  it('keeps staff (role user) away from admin-only routes', async () => {
    const app = api();
    const admin = await adminHeader(app);
    await app.post('/admin/users/register').set(admin).send({ name: 'Gate', email: 'gate@example.com', password: 'password123', role: 'user' });
    const { body } = await app.post('/admin/users/login').send({ email: 'gate@example.com', password: 'password123' });
    const staff = { Authorization: `Bearer ${body.token}` };

    expect((await app.get('/users').set(staff)).status).toBe(403);
    expect((await app.get('/users/admin/scanned-list').set(staff)).status).toBe(200);
  });
});
