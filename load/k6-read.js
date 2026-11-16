// k6 load test for the read paths of the pilot (docs/discovery/06 §5).
// Never run it against production. Usage (see README "Prueba de carga"):
//   docker run --rm --network host -e SCENARIO=smoke \
//     -e MENTEE_EMAIL=... -e MENTEE_PASSWORD=... \
//     -v "$PWD/load:/load" grafana/k6:1.0.0 run /load/k6-read.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const API = (__ENV.API_URL || 'http://localhost:3000/v1').replace(/\/+$/, '');
const ORIGIN = __ENV.WEB_ORIGIN || 'http://localhost:3001';
const SCENARIO = __ENV.SCENARIO || 'smoke';

const scenarios = {
  smoke: { executor: 'constant-vus', vus: 1, duration: '1m' },
  baseline: { executor: 'constant-vus', vus: 20, duration: '5m' },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 100 },
      { duration: '1m', target: 100 },
      { duration: '30s', target: 0 },
    ],
  },
};

export const options = {
  // Keep the session cookie across iterations (k6 resets the jar by default).
  noCookiesReset: true,
  scenarios: { [SCENARIO]: scenarios[SCENARIO] },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{flow:catalog}': ['p(95)<500'],
    'http_req_duration{flow:detail}': ['p(95)<500'],
    'http_req_duration{flow:slots}': ['p(95)<800'],
    'http_req_duration{flow:recommendations}': ['p(95)<1500'],
    http_req_duration: ['p(99)<2000'],
  },
};

const QUERIES = ['', 'datos', 'biología', 'ingeniería', 'becas'];

export function setup() {
  const catalog = http.get(`${API}/mentors?limit=20`);
  const mentors = catalog.json('items') || [];

  if (mentors.length === 0) {
    throw new Error('The catalog is empty: run pnpm db:seed:demo first');
  }

  const targets = mentors
    .filter((mentor) => mentor.offerings && mentor.offerings.length > 0)
    .map((mentor) => ({ id: mentor.userId, offeringId: mentor.offerings[0].id }));

  return { targets };
}

function login() {
  if (!__ENV.MENTEE_EMAIL || !__ENV.MENTEE_PASSWORD) {
    return null;
  }

  const response = http.post(
    `${API}/auth/login`,
    JSON.stringify({
      email: __ENV.MENTEE_EMAIL,
      password: __ENV.MENTEE_PASSWORD,
    }),
    { headers: { 'Content-Type': 'application/json', Origin: ORIGIN } },
  );

  check(response, { 'login 200': (r) => r.status === 200 });
  return response.status === 200;
}

let signedIn = false;

export default function (data) {
  // Each VU keeps its own cookie jar, so it signs in once on its first run.
  if (__ITER === 0) {
    signedIn = login() === true;
  }

  const pick = Math.random();
  const target = data.targets[Math.floor(Math.random() * data.targets.length)];

  if (pick < 0.55) {
    group('catalog', () => {
      const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
      const response = http.get(
        `${API}/mentors?limit=12${q ? `&q=${encodeURIComponent(q)}` : ''}`,
        { tags: { flow: 'catalog' } },
      );
      check(response, { 'catalog 200': (r) => r.status === 200 });
    });
  } else if (pick < 0.8) {
    group('detail', () => {
      const response = http.get(`${API}/mentors/${target.id}`, {
        tags: { flow: 'detail' },
      });
      check(response, { 'detail 200': (r) => r.status === 200 });
    });
  } else if (pick < 0.95 || !signedIn) {
    group('slots', () => {
      const from = new Date();
      const to = new Date(from.getTime() + 14 * 86_400_000);
      const response = http.get(
        `${API}/mentors/${target.id}/slots?offeringId=${target.offeringId}` +
          `&from=${from.toISOString()}&to=${to.toISOString()}`,
        { tags: { flow: 'slots' } },
      );
      check(response, { 'slots 200': (r) => r.status === 200 });
    });
  } else {
    group('recommendations', () => {
      const response = http.get(`${API}/me/recommendations`, {
        tags: { flow: 'recommendations' },
      });
      check(response, { 'recommendations 200': (r) => r.status === 200 });
    });
  }

  sleep(Math.random() * 1.5 + 0.5);
}
