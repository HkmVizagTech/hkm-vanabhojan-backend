const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const crypto = require('node:crypto');
const { createApp } = require('../src/app');

let mongod;

async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'test' });
}

async function stopDb() {
  await mongoose.disconnect();
  await mongod?.stop();
}

async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map(c => c.deleteMany({})));
}

const api = () => request(createApp());

/** Registers the bootstrap admin and returns a bearer header. */
async function adminHeader(app = api()) {
  await app.post('/admin/users/register').send({ name: 'Admin', email: 'admin@example.com', password: 'password123' });
  const { body } = await app.post('/admin/users/login').send({ email: 'admin@example.com', password: 'password123' });
  return { Authorization: `Bearer ${body.token}` };
}

const registrationForm = (overrides = {}) => ({
  name: 'Arjun Rao',
  whatsappNumber: '9876543210',
  email: 'arjun@example.com',
  gender: 'Male',
  dob: '2004-04-04',
  collegeOrWorking: 'College',
  college: 'GITAM',
  course: 'B.Tech',
  year: '2',
  howDidYouKnow: 'Instagram Reel',
  ...overrides,
});

const eventPayload = (overrides = {}) => ({
  name: 'Vanabhojanam 2026',
  date: '2026-11-08',
  venue: { name: 'HK Vaikuntham Temple', address: 'Gambheeram' },
  fees: { college: 99, working: 1200 },
  registrationOpen: true,
  ...overrides,
});

/** Creates an event through the API (the first one becomes current). */
async function createEvent(headers, overrides) {
  const res = await api().post('/events').set(headers).send(eventPayload(overrides));
  if (res.status !== 201) throw new Error(`createEvent failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.event;
}

const sign = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

module.exports = { startDb, stopDb, clearDb, api, adminHeader, registrationForm, sign, createEvent, eventPayload };
