const axios = require('axios');
const { env, integrations } = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const BASE = 'https://api.gupshup.io';

/** Low-level form POST to Gupshup. Returns the raw axios response (status is not thrown on). */
async function postForm(path, fields) {
  if (!integrations.gupshup) throw ApiError.unavailable('WhatsApp is not configured');
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return axios.post(`${BASE}${path}`, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', apikey: env.GUPSHUP_API_KEY },
    timeout: 30000,
    validateStatus: () => true,
  });
}

/** Sends an approved template message. Throws ApiError(502) when Gupshup rejects it. */
async function sendTemplate({ to, templateId, params = [] }) {
  const response = await postForm('/wa/api/v1/template/msg', {
    source: env.GUPSHUP_SOURCE,
    destination: to,
    'src.name': env.GUPSHUP_APP_NAME,
    template: { id: templateId, params },
  });
  if (response.status < 200 || response.status >= 300) {
    logger.warn({ status: response.status, data: response.data }, 'Gupshup rejected template message');
    throw new ApiError(502, `WhatsApp provider error (${response.status})`);
  }
  return response.data;
}

module.exports = { postForm, sendTemplate };
