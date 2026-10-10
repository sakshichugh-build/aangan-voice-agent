import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Exchanges the magic-link code for a session, ensures a profile row exists. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Ensure a profile exists. profiles has no INSERT policy for the user, so
        // use the service role (the DB trigger also covers new signups).
        await supabaseAdmin()
          .from('profiles')
          .upsert(
            { id: user.id, email: user.email, role: 'front_desk' },
            { onConflict: 'id', ignoreDuplicates: true },
          );
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
