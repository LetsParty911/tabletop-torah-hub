import { evaluateRequest, locationFromHeaders, matchesFlowerMound, POLICY_ID } from './flower-mound.mjs';

const ROOT = '/__protection';
export const CASES = Object.freeze({
  'flower-mound': { city: 'Flower%20Mound', region: 'TX', country: 'US' },
  lewisville: { city: 'Lewisville', region: 'TX', country: 'US' },
  passaic: { city: 'Passaic', region: 'NJ', country: 'US' },
  'wrong-state': { city: 'Flower Mound', region: 'NJ', country: 'US' },
  'wrong-country': { city: 'Flower Mound', region: 'TX', country: 'CA' },
  missing: { city: null, region: null, country: null },
});
const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; connect-src 'self'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
function json(body, status = 200) { return Response.json(body, { status, headers: HEADERS }); }

// Fixtures are confined to this namespace, never set a cookie, never call next(),
// and never fetch the real site. Production cannot enable them via a request.
export function previewResponse(request, environment) {
  const url = new URL(request.url);
  if (url.pathname !== ROOT && !url.pathname.startsWith(ROOT + '/')) return null;
  if (environment !== 'preview') return new Response('Not found', { status: 404, headers: HEADERS });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'GET' } });
  if (url.pathname === ROOT + '/status') {
    const location = locationFromHeaders(request.headers);
    return json({ policy: POLICY_ID, environment, location, decision: matchesFlowerMound(location) ? 'deny' : 'allow', scope: 'private preview only', simulationChangesRealRequests: false });
  }
  if (url.pathname === ROOT + '/test') {
    const caseName = url.searchParams.get('case');
    if (!Object.hasOwn(CASES, caseName)) return json({ error: 'Unknown test case' }, 400);
    const path = url.searchParams.get('path') || '/';
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\r\n]/.test(path)) return json({ error: 'Invalid test path' }, 400);
    const method = url.searchParams.get('method') || 'GET';
    if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(method)) return json({ error: 'Invalid method' }, 400);
    const target = new Request(new URL(path, 'https://fixture.invalid'), { method, headers: { accept: path.endsWith('.pdf') ? 'application/pdf' : 'text/html' } });
    const response = evaluateRequest(target, CASES[caseName]);
    if (response) {
      response.headers.set('X-TFTT-Test-Case', caseName);
      response.headers.set('X-TFTT-Test-Only', 'true');
      return response;
    }
    return json({ decision: 'allow', case: caseName, targetPath: path, targetMethod: method, pageContentReached: true, content: 'SAFE_TEST_CONTENT', realSiteRequested: false });
  }
  if (url.pathname !== ROOT && url.pathname !== ROOT + '/') return json({ error: 'Not found' }, 404);
  return new Response(PAGE, { headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private protection check | Torah For The Table</title><style>
:root{color-scheme:light;font-family:system-ui,sans-serif;color:#182c48;background:#f7f3ea}*{box-sizing:border-box}body{margin:0;padding:36px 20px}main{max-width:850px;margin:auto}.eyebrow{font-size:12px;letter-spacing:.16em;font-weight:700;color:#876323}h1{font:700 clamp(30px,5vw,46px)/1.15 Georgia,serif;margin:14px 0}p{line-height:1.6}.card{background:#fff;border:1px solid #e4dbc8;border-radius:14px;padding:24px;margin:22px 0}.pill{display:inline-block;font-size:12px;font-weight:700;border-radius:99px;padding:7px 11px;background:#e9f1eb;color:#285139}button,a.button{display:inline-block;border:0;border-radius:7px;background:#182c48;color:#fff;padding:12px 18px;font:inherit;cursor:pointer;text-decoration:none;margin:4px}a{color:#193b65}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:13px 8px;border-bottom:1px solid #ece7dd;text-align:left}th{font-size:12px;color:#667187}.pass{color:#22663c;font-weight:bold}.fail{color:#a52929;font-weight:bold}code{overflow-wrap:anywhere}#status{font-size:14px}footer{font-size:13px;color:#647086}button:disabled{opacity:.6}button:focus-visible,a:focus-visible{outline:3px solid #bd964b;outline-offset:3px}@media(max-width:500px){.card{padding:16px}th,td{padding:10px 4px;font-size:12px}}
</style></head><body><main><div class="eyebrow">TORAH FOR THE TABLE</div><h1>Private protection check</h1><span class="pill">Preview only · sign-in protected</span><p>Flower Mound, Texas, United States is denied before website content is served. Only an exact match is denied. Nearby cities and incomplete locations pass through.</p><section class="card"><h2>Check safely</h2><p>These isolated tests use sample locations and harmless test content. They do not change your location, set a bypass cookie, touch visitor records, or change the public website.</p><button id="run" type="button">Run all checks</button><a class="button" href="/">Open protected website preview</a><p>The website preview is read-only. Subscription and admin submissions are disabled here. Allowed PDF links open on the current public website so its existing filters see your actual connection.</p><p id="status" role="status" aria-live="polite">Ready to check.</p><table><thead><tr><th scope="col">Test</th><th scope="col">Expected</th><th scope="col">Result</th></tr></thead><tbody id="results"></tbody></table></section><section class="card"><h2>Your connection</h2><p id="connection">Reading the hosting platform’s location…</p><p>Location comes from the connection’s approximate IP location. A VPN or a location-database error can change this result.</p></section><footer>No production domain or public visibility changes are part of this preview. Direct public storage links remain outside this website gate.</footer></main><script>
const tests=[['Flower Mound: homepage','flower-mound','/',403,'GET'],['Flower Mound: page','flower-mound','/parsha/toldos',403,'GET'],['Flower Mound: PDF','flower-mound','/view/sample/pdf',403,'GET'],['Flower Mound: direct PDF','flower-mound','/sample.pdf',403,'GET'],['Flower Mound: asset','flower-mound','/assets/sample.js',403,'GET'],['Flower Mound: API','flower-mound','/api/example',403,'POST'],['Flower Mound: HEAD','flower-mound','/',403,'HEAD'],['Lewisville, Texas','lewisville','/',200,'GET'],['Passaic, New Jersey','passaic','/view/sample/pdf',200,'GET'],['Same name, another state','wrong-state','/',200,'GET'],['Same name, another country','wrong-country','/',200,'GET'],['Missing location','missing','/',200,'GET']];
document.getElementById('run').onclick=async()=>{const button=document.getElementById('run'),rows=document.getElementById('results');button.disabled=true;rows.replaceChildren();let passed=0;for(const [name,fixture,path,expected,method] of tests){const tr=document.createElement('tr');for(const value of [name,String(expected),'Checking…']){const td=document.createElement('td');td.textContent=value;tr.append(td)}rows.append(tr);try{const q=new URLSearchParams({case:fixture,path,method});const res=await fetch('/__protection/test?'+q,{cache:'no-store',redirect:'error'});const body=await res.text();const ok=res.status===expected&&(expected===403?!body.includes('SAFE_TEST_CONTENT'):body.includes('SAFE_TEST_CONTENT'))&&(expected!==403||res.headers.get('x-tftt-decision')==='deny');tr.lastChild.textContent=ok?'Passed':'Failed ('+res.status+')';tr.lastChild.className=ok?'pass':'fail';if(ok)passed++}catch{tr.lastChild.textContent='Request failed';tr.lastChild.className='fail'}}document.getElementById('status').textContent=passed+' of '+tests.length+' checks passed.';button.disabled=false};
fetch('/__protection/status',{cache:'no-store'}).then(r=>r.json()).then(d=>{document.getElementById('connection').textContent=[d.location.city?decodeURIComponent(d.location.city):'Unknown city',d.location.region||'Unknown state',d.location.country||'Unknown country'].join(', ')+' — actual policy decision: '+d.decision.toUpperCase()}).catch(()=>{document.getElementById('connection').textContent='Could not read location. No visitor settings were changed.'});
</script></body></html>`;
