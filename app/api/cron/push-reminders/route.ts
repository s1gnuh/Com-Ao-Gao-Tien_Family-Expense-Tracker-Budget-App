import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  buildReminderPayload,
  collectReminderFacts,
  householdHourNow,
  sendPush,
} from '@/lib/push';
import { todayInput } from '@/lib/formatters';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Vercel Hobby cron jobs cannot run more often than once a day each, so the
 * hour-by-hour schedule in vercel.json is 24 separate jobs — one per UTC hour
 * — all pointing here. Which of those firings matters is decided inside this
 * route from the real clock, not baked into any one job's schedule, so a late
 * invocation (Vercel's own docs say a job can land anywhere in its hour) still
 * reads the correct household hour instead of a stale assumption.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return await sendDueReminders();
  } catch (error) {
    // A crash here must not look like silence to Vercel's cron log — every
    // other failure path already returns a JSON body instead of throwing.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

async function sendDueReminders() {
  const supabase = createServiceClient();
  const hour = householdHourNow();
  const today = todayInput();

  const { data: due, error } = await supabase
    .from('notification_preferences')
    .select('user_id')
    .eq('enabled', true)
    .eq('remind_hour', hour)
    .or(`last_sent_on.is.null,last_sent_on.neq.${today}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notified = 0;
  let skippedNoDevice = 0;

  for (const row of due ?? []) {
    const userId = row.user_id as string;

    const [subsResult, facts] = await Promise.all([
      supabase.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', userId),
      collectReminderFacts(supabase, userId),
    ]);

    const subs = subsResult.data ?? [];

    // Marked sent even with no device left: the hour's attempt is done either
    // way, and this is what stops the same user being requeried every hour
    // with nothing to send.
    await supabase
      .from('notification_preferences')
      .update({ last_sent_on: today })
      .eq('user_id', userId);

    if (subs.length === 0) {
      skippedNoDevice += 1;
      continue;
    }

    const payload = buildReminderPayload(facts);

    const results = await Promise.all(subs.map((sub) => sendPush(sub, payload)));
    const gone = subs.filter((_, index) => results[index] === 'gone').map((sub) => sub.id);
    if (gone.length > 0) await supabase.from('push_subscriptions').delete().in('id', gone);

    if (results.some((outcome) => outcome === 'sent')) notified += 1;
  }

  return NextResponse.json({ hour, due: due?.length ?? 0, notified, skippedNoDevice });
}
