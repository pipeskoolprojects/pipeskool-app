# (re)start the shim and the Next server for the update-484 e2e
cd /home/claude/work/test484
[ -f shim.pid ] && kill $(cat shim.pid) 2>/dev/null
nohup node shim.js > /tmp/claude-0/shim.log 2>&1 & echo $! > shim.pid
ps -eo pid,args | grep -E "next (start|-server)|next-server" | grep -v grep | awk '{print $1}' | xargs -r kill -9
cd /home/claude/work/it475
env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy -u GLOBAL_AGENT_HTTPS_PROXY -u GLOBAL_AGENT_HTTP_PROXY NEXT_PUBLIC_SUPABASE_URL=http://mock.supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=mockkey GROQ_API_KEY=test GEMINI_API_KEY=test GROQ_BASE_URL=http://mock.supabase.test/__ai/groq GEMINI_BASE_URL=http://mock.supabase.test/__ai/gemini nohup npx next start -p 3475 > /tmp/claude-0/next484.log 2>&1 &
sleep 7
