const axios = require('axios');
const { env, integrations } = require('../config/env');
const { LANGUAGE } = require('../config/whatsapp');
const ApiError = require('../utils/ApiError');

/** A media header goes first in `components`. Only image and document headers are used. */
const headerComponent = header => {
  if (!header) return [];
  const media = header.type === 'document'
    ? { type: 'document', document: { link: header.link, filename: header.filename } }
    : { type: 'image', image: { link: header.link } };
  return [{ type: 'header', parameters: [media] }];
};

const bodyComponent = params => ({ type: 'body', parameters: params.map(text => ({ type: 'text', text: String(text) })) });

/** The provider can answer 200 with a failure in the body, so look at the body too. */
const failureIn = data => {
  if (!data || typeof data !== 'object') return null;
  if (data.success === false || data.status === false || ['error', 'failed', 'fail'].includes(String(data.status).toLowerCase())) {
    return data.message || data.error || 'rejected by provider';
  }
  return data.error ? String(data.error.message || data.error) : null;
};

/** Sends one approved template through Flaxxa WAPI. Resolves to the provider response, throws ApiError(502) on failure. */
async function sendTemplate({ to, template, params = [], header }) {
  if (!integrations.whatsapp) throw ApiError.unavailable('WhatsApp is not configured');
  const response = await axios.post(
    `${env.FLAXXA_BASE_URL}/sendtemplatemessage`,
    {
      token: env.FLAXXA_API_TOKEN,
      phone: to,
      template_name: template,
      template_language: LANGUAGE,
      components: [...headerComponent(header), bodyComponent(params)],
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true }
  );
  const failure = response.status < 200 || response.status >= 300 ? `HTTP ${response.status}` : failureIn(response.data);
  if (failure) {
    const error = new ApiError(502, `WhatsApp provider error: ${failure}`);
    error.providerResponse = response.data;
    throw error;
  }
  return response.data;
}

module.exports = { sendTemplate };
