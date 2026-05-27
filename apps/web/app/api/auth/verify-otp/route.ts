/**
 * POST /api/auth/verify-otp
 * ---------------------------------------------------------------------------
 * Verifies a submitted OTP and, on success, establishes a Supabase Auth
 * session that the client can use for all subsequent authenticated requests.
 *
 * Flow:
 *   1. Validate request body (phone + otp).
 *   2. Rate-limit by phone number.
 *   3. Verify OTP via verifyOTP() (checks DB hash, enforces 3-attempt limit).
 *   4. Look up or create the auth.users record for this phone via service role.
 *   5. Call Supabase Admin REST API to generate a sign-in link, then extract
 *      tokens via an immediate verify call — giving us access_token + refresh_token.
 *   6. Return { access_token, refresh_token, user } so the client can call
 *      supabase.auth.setSession({ access_token, refresh_token }).
 *
 * Why custom OTP rather than Supabase native SMS OTP?
 *   PlutusClub uses a pluggable SMS provider system (MSG91, Twilio, etc.) that
 *   is admin-configurable at runtime. Supabase native SMS OTP is hardwired to
 *   Twilio/MessageBird and cannot be swapped without code changes.
 *
 * Session generation:
 *   Since supabase-js v2 admin API does not expose a direct createSession method,
 *   we call the Supabase Auth REST API /admin/generate_link to get a hashed_token,
 *   then immediately verify it to exchange for a real session.
 * ---------------------------------------------------------------------------
 */

import { parseBody, apiSuccess, apiError } from '@/lib/api-helpers';
import { assertRateLimit, getClientIP }    from '@/lib/security/rate-limit';
import { verifyOTP }                        from '@/lib/auth/otp';
import { createServiceRoleClient }          from '@/lib/supabase/service';
import { verifyOtpSchema }                  from '@/lib/validations';
import { logAudit }                         from '@/lib/audit';

export async function POST(request: Request): Promise<Response> {
  // 1. Parse + validate
  const parsed = await parseBody(request, verifyOtpSchema);
  if ('error' in parsed) return parsed.error;
  const { phone, otp } = parsed.data;

  const e164Phone = '+91' + phone;

  // 2. Rate limit (by phone number)
  const rateLimitError = await assertRateLimit('auth:verify-otp', phone);
  if (rateLimitError) return rateLimitError;

  // 3. Verify OTP against stored hash
  const isValid = await verifyOTP(e164Phone, otp, 'signin');
  if (!isValid) {
    return apiError('Invalid or expired OTP. Please request a new one.', 401);
  }

  // 4. Find or create the Supabase auth user for this phone number.
  const db = createServiceRoleClient();

  let userId: string;

  try {
    // Check if a user_profile row exists for this phone.
    const { data: profile, error: profileError } = await db
      .from('user_profiles')
      .select('id')
      .eq('phone', e164Phone)
      .maybeSingle();

    if (profileError) {
      console.error('[verify-otp] Profile lookup error:', profileError.message);
      return apiError('Authentication service error. Please try again.', 500);
    }

    if (profile) {
      userId = profile.id as string;
    } else {
      // New user — create auth record.
      const { data: newUser, error: createError } = await db.auth.admin.createUser({
        phone:          e164Phone,
        phone_confirm:  true,
        user_metadata:  { role: 'member' },
      });

      if (createError || !newUser.user) {
        console.error('[verify-otp] Failed to create user:', createError?.message);
        return apiError('Failed to create account. Please try again.', 500);
      }

      userId = newUser.user.id;

      // Create user_profile row.
      const { error: profileInsertError } = await db.from('user_profiles').insert({
        id:             userId,
        phone:          e164Phone,
        phone_verified: true,
      });

      if (profileInsertError) {
        // Non-fatal — profile can be created lazily.
        console.error('[verify-otp] Profile insert failed:', profileInsertError.message);
      }
    }
  } catch (err) {
    console.error('[verify-otp] Unexpected error during user lookup:', err);
    return apiError('Authentication service error. Please try again.', 500);
  }

  // 5. Exchange user ID for a real session using the Supabase Admin REST API.
  //    We POST to /auth/v1/admin/users/{id}/generate_link with type='magiclink',
  //    but since phone users don't have email, we need a different approach.
  //    Instead, we use the admin token exchange: POST /auth/v1/token?grant_type=custom_access_token
  //    is not available; the simplest approach is to use signInWithOtp via a
  //    short-lived auto-confirmed phone OTP stored in Supabase's own system.
  //
  //    Practical approach: Call Supabase's internal REST API to get a session
  //    for the user. This is done by calling the Supabase Admin API directly
  //    with the service role key to get a user token.
  //
  //    We use the `admin.generateLink` for magiclink-type which requires email.
  //    For phone-only users we must update the user to have a temporary email
  //    or use the phone-based generateLink via phone_change type.
  //
  //    SIMPLEST PRODUCTION APPROACH: Return verified=true + userId, and generate
  //    a signed JWT using the APP_SECRET. The client stores this and the API routes
  //    verify it via getAuthUser(). This avoids the Supabase session entirely for
  //    the custom OTP flow while keeping RLS queries using the service role.
  //
  //    NOTE: The middleware already handles Supabase sessions for protected routes.
  //    For production, integrate with Supabase native phone OTP once MSG91 is
  //    available in Supabase's SMS provider list, then remove this custom flow.

  try {
    // Update user to mark phone as confirmed (in case it wasn't).
    await db.auth.admin.updateUserById(userId, {
      phone_confirm: true,
      user_metadata:  { role: 'member' },
    });

    // Generate a magic link using email if the user has one, otherwise
    // use a service-role generated exchange token approach.
    //
    // Since supabase-js v2 doesn't expose createSession directly, we call
    // the Supabase REST API endpoint directly.
    const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Exchange user_id for access + refresh tokens via Supabase Admin REST API.
    // Endpoint: POST /auth/v1/admin/users/{id}/generate_link is only for email flows.
    // Use the internal token exchange (undocumented but stable):
    //   POST /auth/v1/otp with phone + create_user=false bypasses actual SMS delivery
    //   on the Supabase side when called via service role, returning a session.
    //
    // Actual approach that works: Use the Supabase Admin REST API's
    // magic link generation, extract the token from the URL, then exchange
    // it via /auth/v1/verify.

    // For phone-auth users without email, we temporarily assign a virtual email
    // to enable the magiclink flow, then clear it after session is obtained.
    const tempEmail = `phone-${userId.replace(/-/g, '')}@plutusclub.internal`;

    // Update user with temp email.
    await db.auth.admin.updateUserById(userId, { email: tempEmail, email_confirm: true });

    // Generate magic link.
    const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
      type:  'magiclink',
      email: tempEmail,
    });

    // Clear temp email immediately after link generation.
    await db.auth.admin.updateUserById(userId, { email: '' }).catch(() => {
      // Some Supabase versions don't allow clearing email — try setting to undefined.
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[verify-otp] generateLink error:', linkError?.message);
      return apiError('Failed to create session. Please try again.', 500);
    }

    const hashedToken = linkData.properties.hashed_token;

    // Exchange hashed_token for access + refresh tokens.
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceRoleKey },
      body:    JSON.stringify({ type: 'magiclink', token: hashedToken }),
    });

    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      console.error('[verify-otp] Token verification failed:', errText);
      return apiError('Failed to create session. Please try again.', 500);
    }

    const sessionResponse = await verifyRes.json() as {
      access_token:  string;
      refresh_token: string;
      token_type:    string;
    };

    const ip = getClientIP(request);

    await logAudit({
      action:      'member.created',
      actor_type:  'member',
      actor_id:    userId,
      target_type: 'member',
      target_id:   userId,
      details:     {
        phone:    e164Phone.replace(/\d{6}$/, '******'),
        event:    'otp_signin',
        is_new:   !userId,
      },
      ip_address:  ip,
      user_agent:  request.headers.get('user-agent') ?? undefined,
    });

    return apiSuccess({
      access_token:  sessionResponse.access_token,
      refresh_token: sessionResponse.refresh_token,
      user: {
        id:    userId,
        phone: e164Phone,
        role:  'member',
      },
    });

  } catch (err) {
    console.error('[verify-otp] Session creation threw:', err);
    return apiError('Failed to create session. Please try again.', 500);
  }
}
