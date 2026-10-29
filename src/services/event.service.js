const mongoose = require('mongoose');
const Event = require('../models/Event');
const Candidate = require('../models/Candidate');
const { PAYMENT_STATUS } = require('../config/constants');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const whatsapp = require('./whatsapp.service');

const PAID = PAYMENT_STATUS.PAID;

const findOrFail = async id => {
  const event = await Event.findById(id);
  if (!event) throw ApiError.notFound('Event not found');
  return event;
};

const getCurrent = () => Event.findOne({ isCurrent: true });

/** What the public site needs; nothing else. */
const publicView = event =>
  event && {
    id: event._id,
    name: event.name,
    date: event.date,
    venue: event.venue,
    fees: event.fees,
    ageMin: event.ageMin,
    ageMax: event.ageMax,
    registrationOpen: event.registrationOpen,
  };

/** The edition new registrations go to. Throws when there is none or it is closed. */
async function currentOpenEvent() {
  const event = await getCurrent();
  if (!event) throw ApiError.conflict('Registrations are not open yet');
  if (!event.registrationOpen) throw ApiError.conflict('Registrations are currently closed');
  return event;
}

const feeFor = (event, type) => (type === 'College' ? event.fees.college : event.fees.working);

/** Per-event numbers for the admin: one aggregation instead of a query per event. */
async function statsByEvent() {
  const rows = await Candidate.aggregate([
    {
      $group: {
        _id: '$event',
        registrations: { $sum: 1 },
        paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$paymentStatus', PAYMENT_STATUS.PENDING] }, 1, 0] } },
        refunded: { $sum: { $cond: [{ $eq: ['$paymentStatus', PAYMENT_STATUS.REFUNDED] }, 1, 0] } },
        revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, '$paymentAmount', 0] } },
        attended: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentStatus', PAID] }, { $eq: ['$adminAttendance', true] }] }, 1, 0] } },
        students: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentStatus', PAID] }, { $eq: ['$collegeOrWorking', 'College'] }] }, 1, 0] } },
        others: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentStatus', PAID] }, { $eq: ['$collegeOrWorking', 'Working'] }] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map(r => [String(r._id), r]));
}

const emptyStats = { registrations: 0, paid: 0, pending: 0, refunded: 0, revenue: 0, attended: 0, students: 0, others: 0 };

async function list() {
  const [events, stats] = await Promise.all([Event.find().sort({ date: -1 }), statsByEvent()]);
  const legacy = stats.get('null') || stats.get('undefined');
  return {
    events: events.map(e => ({ ...e.toObject(), stats: { ...emptyStats, ...(stats.get(String(e._id)) || {}) } })),
    legacyRegistrations: legacy ? legacy.registrations : 0,
  };
}

/** Makes `event` the only current edition. */
async function setCurrent(id) {
  const event = await findOrFail(id);
  await Event.updateMany({ _id: { $ne: event._id } }, { $set: { isCurrent: false } });
  event.isCurrent = true;
  await event.save();
  return event;
}

async function create(data) {
  const event = await Event.create(data);
  // The very first edition goes live straight away.
  if ((await Event.countDocuments()) === 1) return setCurrent(event._id);
  return event;
}

async function update(id, data) {
  const event = await findOrFail(id);
  event.set(data);
  await event.save();
  return event;
}

async function remove(id) {
  const event = await findOrFail(id);
  if (await Candidate.exists({ event: event._id })) {
    throw ApiError.conflict('This event has registrations, so it cannot be deleted. Close registration instead.');
  }
  await event.deleteOne();
  return event;
}

/** Attaches registrations that pre-date events (no event set) to one edition. */
async function adoptLegacy(id) {
  const event = await findOrFail(id);
  const result = await Candidate.updateMany({ event: { $exists: false } }, { $set: { event: event._id } });
  const nulls = await Candidate.updateMany({ event: null }, { $set: { event: event._id } });
  return result.modifiedCount + nulls.modifiedCount;
}

/**
 * Edition-by-edition comparison plus retention: how many of an edition's paid people
 * (by WhatsApp number) had also paid for an earlier edition.
 */
async function analytics() {
  const [events, stats, pairs] = await Promise.all([
    Event.find().sort({ date: 1 }),
    statsByEvent(),
    Candidate.aggregate([
      { $match: { paymentStatus: PAID, event: { $ne: null } } },
      { $group: { _id: { event: '$event', phone: '$whatsappNumber' }, attended: { $max: { $cond: ['$adminAttendance', 1, 0] } } } },
    ]),
  ]);

  const phonesByEvent = new Map();
  for (const p of pairs) {
    const key = String(p._id.event);
    if (!phonesByEvent.has(key)) phonesByEvent.set(key, new Set());
    phonesByEvent.get(key).add(p._id.phone);
  }

  const seenBefore = new Set();
  const rows = events.map(event => {
    const s = { ...emptyStats, ...(stats.get(String(event._id)) || {}) };
    const phones = phonesByEvent.get(String(event._id)) || new Set();
    const returning = [...phones].filter(phone => seenBefore.has(phone)).length;
    phones.forEach(phone => seenBefore.add(phone));
    return {
      id: event._id,
      name: event.name,
      date: event.date,
      isCurrent: event.isCurrent,
      ...s,
      uniquePeople: phones.size,
      returning,
      attendanceRate: s.paid ? Math.round((s.attended / s.paid) * 100) : 0,
    };
  });
  return { events: rows };
}

/**
 * People to invite to `to`: everyone from `from` in the chosen audience whose WhatsApp number
 * has not already paid for `to`. One row per number; family members are merged.
 */
async function followupList({ from, to, audience }) {
  await Promise.all([findOrFail(from), findOrFail(to)]);
  const match = { event: new mongoose.Types.ObjectId(from), paymentStatus: PAID };
  if (audience === 'attended') match.adminAttendance = true;
  if (audience === 'no_show') match.adminAttendance = { $ne: true };

  const [people, already] = await Promise.all([
    Candidate.aggregate([
      { $match: match },
      { $sort: { registrationDate: -1 } },
      {
        $group: {
          _id: '$whatsappNumber',
          names: { $addToSet: '$name' },
          college: { $first: { $ifNull: ['$college', '$companyName'] } },
          collegeOrWorking: { $first: '$collegeOrWorking' },
          email: { $first: '$email' },
          attended: { $max: { $cond: ['$adminAttendance', 1, 0] } },
        },
      },
      { $sort: { college: 1 } },
    ]),
    Candidate.distinct('whatsappNumber', { event: to, paymentStatus: PAID }),
  ]);

  const taken = new Set(already);
  const rows = people
    .filter(p => !taken.has(p._id))
    .map(p => ({ phone: p._id, names: p.names, college: p.college || '', type: p.collegeOrWorking, email: p.email || '', attended: Boolean(p.attended) }));
  return { total: people.length, alreadyRegistered: people.length - rows.length, people: rows };
}

/** WhatsApp invitation to the follow-up list. Needs an approved template: WA_TEMPLATE_FOLLOWUP. */
async function sendFollowup(query) {
  if (!env.WA_TEMPLATE_FOLLOWUP) {
    throw ApiError.unavailable('Set WA_TEMPLATE_FOLLOWUP to an approved template id to send invitations');
  }
  const [{ people }, toEvent] = await Promise.all([followupList(query), findOrFail(query.to)]);
  const results = [];
  for (const person of people) {
    const outcome = await whatsapp.sendTemplateTo({
      phone: person.phone,
      templateId: env.WA_TEMPLATE_FOLLOWUP,
      params: [person.names[0], toEvent.name],
      kind: 'followup',
    });
    results.push({ phone: person.phone, name: person.names[0], status: outcome.ok ? 'sent' : 'failed', ...(outcome.ok ? {} : { error: outcome.error }) });
  }
  return { total: people.length, sent: results.filter(r => r.status === 'sent').length, results };
}

module.exports = {
  getCurrent, publicView, currentOpenEvent, feeFor, list, create, update, remove, setCurrent,
  adoptLegacy, analytics, followupList, sendFollowup, findOrFail,
};
