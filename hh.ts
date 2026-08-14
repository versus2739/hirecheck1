const HH = 'https://api.hh.ru';
const HH_AUTH_BASE = 'https://hh.ru/oauth/authorize';
const HH_TOKEN_URL = 'https://hh.ru/oauth/token';

export function hhAuthUrl(state: string) {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.HH_CLIENT_ID || '',
    redirect_uri: process.env.HH_REDIRECT_URI || '',
    state,
  });
  return HH_AUTH_BASE + '?' + p.toString();
}

export async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.HH_CLIENT_ID || '',
    client_secret: process.env.HH_CLIENT_SECRET || '',
    redirect_uri: process.env.HH_REDIRECT_URI || '',
    code,
  });
  const r = await fetch(HH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as any;
}

export async function hhGet(path: string, token: string) {
  const r = await fetch(HH + path, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'HireCheck MVP' },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as any;
}

export async function employerVacancies(token: string) {
  return hhGet('/vacancies/mine?per_page=100', token);
}

export async function negotiations(token: string, vacancyId: string) {
  return hhGet(`/negotiations?vacancy_id=${vacancyId}&per_page=100`, token);
}

export async function resume(token: string, resumeId: string) {
  return hhGet(`/resumes/${resumeId}`, token);
}

export function resumeToText(r: any) {
  return [
    r.title,
    r.first_name,
    r.last_name,
    r.skills,
    ...(r.experience || []).map((e: any) => `${e.company || ''} ${e.position || ''} ${e.description || ''}`),
  ].filter(Boolean).join('\n');
}
