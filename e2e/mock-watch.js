// TEST HARNESS ONLY. Stands in for the watch's /data endpoint, using the confirmed response shape.
// It is never bundled into the app. Passing against this proves the app's handling of that shape,
// not the behaviour of the real watch.
//
//   node e2e/mock-watch.js [port]
//   POST /scenario/<name>   calm | fall | highrisk | silent | garbage | frozen
const http = require('http');

const port = Number(process.argv[2] ?? 9100);
let scenario = 'calm';
let frozenEpoch = 0;
let seq = 0;
let hits = 0;

const noise = () => (((seq * 7 + 3) % 11) - 5) * 0.0015;
const CALM = [-0.353, -0.231, -0.781];
const FLAT = [0.781, -0.231, 0.353];

function pad(n) {
  return String(n).padStart(2, '0');
}

function reading(v, epochOverride) {
  const now = new Date();
  const n = noise();
  return JSON.stringify({
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    date: now.toUTCString().slice(0, 16),
    x: Number((v[0] + n).toFixed(3)),
    y: Number((v[1] - n).toFixed(3)),
    z: Number((v[2] + n).toFixed(3)),
    epoch: epochOverride ?? Math.floor(Date.now() / 1000),
  });
}

function respond(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  res.end(body);
}

http
  .createServer((req, res) => {
    const match = /^\/scenario\/(\w+)$/.exec(req.url ?? '');
    if (req.method === 'POST' && match) {
      scenario = match[1];
      hits = 0;
      frozenEpoch = Math.floor(Date.now() / 1000);
      respond(res, 200, JSON.stringify({ scenario }));
      return;
    }
    if (req.url !== '/data') {
      respond(res, 404, '{}');
      return;
    }
    seq++;
    hits++;
    switch (scenario) {
      case 'silent':
        return; // Never answers, as a watch that dropped off the network.
      case 'garbage':
        respond(res, 200, '<html>not json</html>');
        return;
      case 'frozen':
        respond(res, 200, reading(CALM, frozenEpoch));
        return;
      case 'fall':
        // Sudden lasting orientation change, then stillness. No impact peak, as usually seen at 1 Hz.
        respond(res, 200, reading(hits === 1 ? [0.3, 0.3, 0.3] : FLAT));
        return;
      case 'highrisk':
        respond(res, 200, reading(hits === 1 ? [1.3, 1.3, 1.3] : FLAT));
        return;
      default:
        respond(res, 200, reading(CALM));
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`mock watch on http://127.0.0.1:${port}/data`));
