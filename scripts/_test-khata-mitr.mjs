import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('/home/user/project-1/.env.local', 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BASE = 'http://localhost:9002';

async function main() {
  // 1. Find (or report no) real user to test against
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, name')
    .order('created_at', { ascending: false })
    .limit(1);

  if (userErr) {
    console.log('USER QUERY ERROR:', userErr.message);
    return;
  }
  if (!users || users.length === 0) {
    console.log('NO USERS FOUND IN DB — cannot test with a real user_id.');
    return;
  }
  const userId = users[0].id;
  console.log('Testing with existing user:', userId, users[0].name);

  // Baseline ledger count
  const { count: beforeCount } = await supabase
    .from('ledger_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  console.log('Ledger entries before:', beforeCount);

  // 2. Test add_ledger_entry via natural language
  const r1 = await fetch(`${BASE}/api/khata-mitr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      inputType: 'text',
      textPayload: 'Aaj 777 rupaye ki bikri hui hai',
      history: [],
    }),
  });
  const j1 = await r1.json();
  console.log('\n[add_ledger_entry test] status:', r1.status);
  console.log(JSON.stringify(j1, null, 2));

  const { count: afterCount } = await supabase
    .from('ledger_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  console.log('Ledger entries after:', afterCount);

  const { data: latestEntry } = await supabase
    .from('ledger_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  console.log('Latest entry row:', JSON.stringify(latestEntry, null, 2));

  // 3. Test get_ledger_summary
  const r2 = await fetch(`${BASE}/api/khata-mitr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      inputType: 'text',
      textPayload: 'Mera pichle 30 din ka profit kitna hai?',
      history: [
        { role: 'user', content: 'Aaj 777 rupaye ki bikri hui hai' },
        { role: 'assistant', content: j1.response || '' },
      ],
    }),
  });
  const j2 = await r2.json();
  console.log('\n[get_ledger_summary test] status:', r2.status);
  console.log(JSON.stringify(j2, null, 2));

  // 4. Test check_scheme_eligibility
  const r3 = await fetch(`${BASE}/api/khata-mitr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      inputType: 'text',
      textPayload: 'Mujhe kaunsi sarkari yojana mil sakti hai?',
      history: [],
    }),
  });
  const j3 = await r3.json();
  console.log('\n[check_scheme_eligibility test] status:', r3.status);
  console.log(JSON.stringify(j3, null, 2));

  // 5. Invalid input validation test
  const r4 = await fetch(`${BASE}/api/khata-mitr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'not-a-uuid', inputType: 'text', textPayload: 'hi' }),
  });
  console.log('\n[validation test] status (expect 400):', r4.status);
  console.log(await r4.text());
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
