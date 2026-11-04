import { getSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { notifySignup } from '@/lib/auth/signupNotification';
import { createSignupSweepHandler } from '@/lib/auth/signupSweep';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = createSignupSweepHandler({
  secret: () => process.env.SIGNUP_NOTIFICATION_WEBHOOK_SECRET,
  enabledAt: () => process.env.SIGNUP_NOTIFICATION_ENABLED_AT,
  marker: 'signup_admin_notification_sent_at',
  listUsers: async (page, perPage) => {
    const { data, error } = await getSupabaseAdminClient({ timeoutMs: 5_000 }).auth.admin.listUsers({ page, perPage });
    if (error) throw new Error('Signup account scan failed');
    return { users: data.users };
  },
  notify: notifySignup,
});
