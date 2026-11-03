-- ElevenLabs Starter includes 30,000 credits per billing month (1 credit per character
-- with eleven_multilingual_v2). Keep 2,000 characters of headroom for conservatively
-- counted retries. Saved recordings never count against this budget.
alter table public.narration_limits alter column monthly_characters set default 28000;
update public.narration_limits set monthly_characters=28000 where id and monthly_characters=10000;
