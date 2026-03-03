var FLARE_URL = function() { return process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1'; };

async function flareGet(url, session) {
  var body = { cmd: 'request.get', url: url, maxTimeout: 60000 };
  if (session) body.session = session;
  var res = await fetch(FLARE_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('FlareSolverr HTTP ' + res.status);
  var data = await res.json();
  if (data.status !== 'ok') throw new Error('FlareSolverr: ' + (data.message || 'error'));
  return data.solution;
}

async function flarePost(url, postData, session) {
  var body = { cmd: 'request.post', url: url, postData: postData, maxTimeout: 60000 };
  if (session) body.session = session;
  var res = await fetch(FLARE_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('FlareSolverr HTTP ' + res.status);
  var data = await res.json();
  if (data.status !== 'ok') throw new Error('FlareSolverr: ' + (data.message || 'error'));
  return data.solution;
}

async function createSession(id) {
  var res = await fetch(FLARE_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'sessions.create', session: id }),
  });
  var data = await res.json();
  return data.status === 'ok';
}

async function destroySession(id) {
  try {
    await fetch(FLARE_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'sessions.destroy', session: id }),
    });
  } catch (e) {}
}

module.exports = { flareGet: flareGet, flarePost: flarePost, createSession: createSession, destroySession: destroySession };

