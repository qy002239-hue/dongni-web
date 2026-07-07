# Release Notes v1.0.0-beta

## Version

- Release: v1.0.0-beta
- Stage: Beta
- Date: 2026-07-07

## Completed In This Release

- Welcome Page is live on production.
- Google OAuth login flow is connected through Supabase Auth.
- AI Chat is available on production.
- Long-term Memory is available and persisted in Supabase.
- Supabase project wiring is in place for auth and memory storage.
- Production deploy is live on Vercel.

## Welcome Page

- Added the current Welcome Page as the unauthenticated entry experience.
- Added consent gating before login.
- Confirmed production now renders the Welcome Page instead of the legacy login screen.

## Google OAuth

- Google login is enabled through Supabase Auth.
- OAuth flow redirects back to the production callback path.
- Production login entry has been verified to open the correct Google OAuth flow.

## AI Chat

- Production chat endpoint responds successfully.
- Streaming assistant replies are available in the chat flow.
- Chat flow is ready for Beta usage.

## Long-term Memory

- Memory tables are in place in Supabase.
- Chat replies can write long-term memory records.
- Memory events are appended for later context continuity.

## Supabase

- Frontend and backend are using the same Supabase project.
- OAuth callback and project URL are aligned.
- Memory persistence uses the current production Supabase project.

## Production Deploy

- Latest Beta changes were pushed to `origin/main`.
- Production auto-deployed from GitHub.
- Production now serves the current Beta build.

## Known Limitations

- Beta maintenance mode is active: only bug fixes are allowed.
- PayPal-related environment variables are still empty in local configuration.
- Beta validation has focused on production readiness, core chat flow, and memory persistence.
- Future feedback should be recorded first in `BETA_BUG_LIST.md` before any code change.

## Beta Test Focus

- Welcome Page renders correctly on production.
- Google OAuth returns users to the correct production callback path.
- AI replies return normally in production chat.
- Long-term Memory writes to `dongni_user_memory` and `dongni_memory_events`.
- New chat sessions continue to use saved memory context.
- Mobile chat input remains visible and usable.

## Next Version Plan

- Improve Beta bug triage and verification workflow.
- Expand production regression checks for post-push validation.
- Add clearer operational runbooks for payment and admin verification.
- Continue small, isolated bug-fix releases only.
