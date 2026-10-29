/**
 * validate({ body, params, query }) parses each part with a zod schema.
 * Parsed values land on `req.valid` (req.query is read-only in Express 5); `req.body` is replaced too.
 */
const validate = schemas => (req, _res, next) => {
  const valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    valid[part] = schemas[part].parse(req[part] ?? {});
  }
  req.valid = valid;
  if (valid.body) req.body = valid.body;
  next();
};

module.exports = { validate };
