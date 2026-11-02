const mockPost = jest.fn();
jest.mock('axios', () => ({ post: (...a) => mockPost(...a), head: jest.fn() }));
jest.mock('../src/config/env', () => {
  const real = jest.requireActual('../src/config/env');
  return { ...real, env: { ...real.env, FLAXXA_API_TOKEN: 'tok', FLAXXA_BASE_URL: 'https://wapi.test/api/v1', WA_APPROVED_TEMPLATES: 'vb_registration_working,vb_qr_pass' }, integrations: { ...real.integrations, whatsapp: true } };
});
const flaxxa = require('../src/services/flaxxa');
const whatsapp = require('../src/services/whatsapp.service');

beforeEach(() => mockPost.mockReset().mockResolvedValue({ status: 200, data: { success: true, messageId: 'm1' } }));
const person = { _id: '9876', name: 'Arjun', whatsappNumber: '9876543210', collegeOrWorking: 'Working' };

describe('Flaxxa client', () => {
  it('posts the documented body with the token, language and ordered body parameters', async () => {
    await flaxxa.sendTemplate({ to: '919876543210', template: 'vb_registration_working', params: ['Arjun', 'Sunday, 29 November 2026'] });
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('https://wapi.test/api/v1/sendtemplatemessage');
    expect(body).toEqual({
      token: 'tok',
      phone: '919876543210',
      template_name: 'vb_registration_working',
      template_language: 'en_US',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Arjun' }, { type: 'text', text: 'Sunday, 29 November 2026' }] }],
    });
  });

  it('puts the media header first', async () => {
    await flaxxa.sendTemplate({ to: '91', template: 'vb_qr_pass', params: ['A'], header: { type: 'image', link: 'https://x/qr.png' } });
    expect(mockPost.mock.calls[0][1].components[0]).toEqual({ type: 'header', parameters: [{ type: 'image', image: { link: 'https://x/qr.png' } }] });
    await flaxxa.sendTemplate({ to: '91', template: 'vb_certificate', params: ['A'], header: { type: 'document', link: 'https://x/c.pdf', filename: 'Vanabhojanam_Certificate.pdf' } });
    expect(mockPost.mock.calls[1][1].components[0].parameters[0]).toEqual({ type: 'document', document: { link: 'https://x/c.pdf', filename: 'Vanabhojanam_Certificate.pdf' } });
  });

  it('treats an HTTP error or a failure body as a failure', async () => {
    mockPost.mockResolvedValue({ status: 500, data: 'oops' });
    await expect(flaxxa.sendTemplate({ to: '91', template: 't', params: [] })).rejects.toThrow(/HTTP 500/);
    mockPost.mockResolvedValue({ status: 200, data: { success: false, message: 'bad token' } });
    await expect(flaxxa.sendTemplate({ to: '91', template: 't', params: [] })).rejects.toThrow(/bad token/);
  });
});

describe('WhatsApp service rules', () => {
  it('skips a template that is not approved yet', async () => {
    const result = await whatsapp.send({ candidate: person, template: 'vb_rejected', params: ['Arjun'], kind: 'reject' });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/not approved/) });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('never sends an empty parameter', async () => {
    await whatsapp.send({ candidate: person, template: 'vb_registration_working', params: ['', '  '], kind: 'registration' });
    const texts = mockPost.mock.calls[0][1].components[0].parameters.map(p => p.text);
    expect(texts).toEqual(['-', '-']);
  });

  it('falls back to "Devotee" for a missing name', () => {
    expect(whatsapp.name({ name: '' })).toBe('Devotee');
  });
});
