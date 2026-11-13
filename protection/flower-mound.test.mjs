import test from 'node:test';
import assert from 'node:assert/strict';
import middleware from '../middleware.js';
import { evaluateRequest, matchesFlowerMound } from './flower-mound.mjs';
import { CASES, previewResponse } from './preview.mjs';

const blockedHeaders = {
  'x-vercel-ip-city': 'Flower%20Mound',
  'x-vercel-ip-country-region': 'TX',
  'x-vercel-ip-country': 'US',
  accept: 'text/html',
};
const request = (path = '/', options = {}) => new Request('https://private-preview.vercel.app' + path, options);

for (const city of ['Flower Mound', 'Flower%20Mound', '  FLOWER   MOUND  ']) {
  for (const region of ['TX', 'Texas', ' tx ']) {
    test(`exact match: ${city}, ${region}`, () => assert.equal(matchesFlowerMound({ city, region, country: 'US' }), true));
  }
}
for (const [name, location] of Object.entries(CASES).filter(([name]) => name !== 'flower-mound')) {
  test(`${name} remains allowed`, () => assert.equal(matchesFlowerMound(location), false));
}
for (const location of [{}, { city: 'Flower Mound', country: 'US' }, { city: 'Flower Mound', region: 'TX' }, { city: 'Flower Mound%' , region: 'TX', country: 'US' }, { city: 'Flower Mound, Lewisville', region: 'TX', country: 'US' }, { city: 'Flower Mounds', region: 'TX', country: 'US' }]) {
  test(`incomplete or malformed location ${JSON.stringify(location)}`, () => assert.equal(matchesFlowerMound(location), false));
}

for (const path of ['/', '/parsha/toldos', '/view/example/pdf', '/example.pdf', '/assets/app.js', '/_serverFn/example', '/api/example', '/admin', '/robots.txt', '/k']) {
  for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS']) {
    test(`${method} ${path} denied before application or assets`, async () => {
      const response = evaluateRequest(request(path, { method, headers: blockedHeaders }));
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('x-tftt-decision'), 'deny');
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
      assert.equal(response.headers.get('location'), null);
      const body = await response.text();
      assert.doesNotMatch(body, /SAFE_TEST_CONTENT|<script|Parshas Toldos/);
      if (method === 'HEAD') assert.equal(body, '');
      if (path.startsWith('/api/') || path.startsWith('/_serverFn/')) assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    });
  }
}

test('untrusted query, cookie, CF and custom headers cannot select or override location', () => {
  assert.equal(evaluateRequest(request('/?city=Flower%20Mound&region=TX&country=US', { headers: { 'cf-ipcity': 'Flower Mound', 'cf-ipcountry': 'US', 'cf-region': 'TX', cookie: 'test=flower-mound', 'x-tftt-test-location': 'flower-mound' } })), null);
  assert.equal(evaluateRequest(request('/?case=lewisville&bypass=1', { headers: { ...blockedHeaders, cookie: 'trusted-vpn=1; internal=1; geo_bypass=1' } })).status, 403);
});
test('normal unknown location continues through actual middleware', () => {
  const response = middleware(request('/?case=flower-mound'));
  assert.equal(response.headers.get('x-middleware-next'), '1');
  assert.equal(response.headers.get('x-tftt-decision'), 'allow');
});
test('actual middleware returns deny instead of next', () => {
  const response = middleware(request('/', { headers: blockedHeaders }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('x-middleware-next'), null);
});
for (const environment of ['production', 'development', undefined]) {
  test(`verification namespace unavailable in ${environment}`, () => {
    for (const path of ['/__protection', '/__protection/test?case=lewisville', '/__protection/status']) {
      assert.equal(previewResponse(request(path), environment).status, 404);
    }
  });
}
test('preview checks never alter normal paths or set cookies', async () => {
  assert.equal(previewResponse(request('/?case=flower-mound'), 'preview'), null);
  for (const [name] of Object.entries(CASES)) {
    const response = previewResponse(request('/__protection/test?case=' + name), 'preview');
    assert.equal(response.status, name === 'flower-mound' ? 403 : 200);
    assert.equal(response.headers.get('set-cookie'), null);
    const body = await response.text();
    assert.equal(body.includes('SAFE_TEST_CONTENT'), name !== 'flower-mound');
  }
});
test('test interface rejects unknown fixtures, external paths and mutations', () => {
  for (const query of ['case=__proto__', 'case=none', 'case=flower-mound&path=https://example.com', 'case=flower-mound&path=//example.com', 'case=flower-mound&path=/%5Cexample.com', 'case=flower-mound&method=DELETE']) {
    assert.equal(previewResponse(request('/__protection/test?' + query), 'preview').status, 400);
  }
  assert.equal(previewResponse(request('/__protection/test?case=lewisville', { method: 'POST' }), 'preview').status, 405);
});
