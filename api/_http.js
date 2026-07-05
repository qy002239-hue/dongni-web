export function parseJsonBody(req) {
  if (!req.body) return {};

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

export function methodNotAllowed(res, method = 'POST') {
  res.setHeader('Allow', method);
  return res.status(405).json({ error: 'Method not allowed' });
}

export function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}
