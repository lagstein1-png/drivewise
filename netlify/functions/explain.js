const MODEL = 'claude-sonnet-5';
const HITS = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 40;

function rateLimited(ip){
  const now = Date.now();
  const rec = HITS.get(ip) || { n: 0, t: now };
  if(now - rec.t > WINDOW_MS){ rec.n = 0; rec.t = now; }
  rec.n++;
  HITS.set(ip, rec);
  if(HITS.size > 5000) HITS.clear();
  return rec.n > MAX_PER_HOUR;
}

const LANG_NAME = { he:'Hebrew', ar:'Arabic', en:'English', ru:'Russian' };

const SYSTEM = `You explain driving-theory questions to people who struggle with reading.
Your reader may be dyslexic, an immigrant, an older driver renewing a licence, or someone
who has failed the test several times.

Rules:
- Answer ONLY in the language you are told to use.
- Maximum 3 short sentences. Short words. Short lines.
- Explain WHY the correct answer is correct, not just what it is.
- Never say the reader is wrong, slow, or should have known.
- No lists, no headings, no markdown. Plain sentences only.
- Never invent a traffic law. If the given answer is all you know, explain only that.`;

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if(event.httpMethod !== 'POST') return json(405, { error: 'method' });
  if(!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'no-key' });

  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';
  if(rateLimited(ip)) return json(429, { error: 'rate' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e){ return json(400, { error: 'bad-json' }); }

  const { q, options, correct, lang } = body;
  if(typeof q !== 'string' || q.length < 5 || q.length > 600) return json(400, { error: 'q' });
  if(!Array.isArray(options) || options.length < 2 || options.length > 6) return json(400, { error: 'o' });
  if(options.some(o => typeof o !== 'string' || o.length > 300)) return json(400, { error: 'o' });
  if(typeof correct !== 'string' || correct.length > 300) return json(400, { error: 'c' });
  const L = LANG_NAME[lang] ? lang : 'he';

  const prompt = 'Language: ' + LANG_NAME[L] + '\n\nQuestion: ' + q + '\n\nOptions:\n' +
    options.map((o,i) => (i+1) + '. ' + o).join('\n') +
    '\n\nCorrect answer: ' + correct +
    '\n\nExplain in ' + LANG_NAME[L] + ', in at most 3 short sentences, why that answer is correct.';

  try{
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 300, system: SYSTEM,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if(!r.ok){ const d = await r.text(); return json(502, { error:'upstream', status:r.status, detail:d.slice(0,300) }); }
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
    if(!text) return json(502, { error: 'empty' });
    return json(200, { text });
  }catch(e){
    return json(502, { error: 'fetch' });
  }
};

function cors(){
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS'
  };
}
function json(statusCode, obj){
  return { statusCode, headers: { 'content-type': 'application/json', ...cors() }, body: JSON.stringify(obj) };
}

