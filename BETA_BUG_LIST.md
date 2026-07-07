# Beta Bug List

## Bug Status

- New
- Confirmed
- In Progress
- Fixed
- Verified
- Closed

## Beta Development Rules

1. Beta period forbids new features.
2. Fix only one bug at a time.
3. Build is required after each fix.
4. Verify only after build succeeds.
5. Commit only after verification succeeds.
6. One bug must map to one commit.
7. Verify production after push.
8. Mark a bug as Closed only after production verification succeeds.
9. Do not mark anything completed before verification is finished.
10. Record all beta feedback first, then schedule the fix; do not modify product code directly before intake.

## Bug Record Template

### BUG-XXX
- Bug ID:
- Title:
- Status:
- Priority:
- Version:
- Found Date:
- Reporter:
- Impact Scope:
- Reproduction Steps:
  1. 
  2. 
  3. 
- Expected Result:
- Actual Result:
- Root Cause Analysis:
- Modified Files:
  - 
- Involves Database Migration: YES / NO
- Involves Environment Variables: YES / NO
- Affects Production: YES / NO
- Verification Method:
- Verification Result:
- Fix Commit:
- Notes:

## Current Bug List

### BUG-001
- Bug ID: BUG-001
- Title: Production served legacy login page instead of Welcome Page
- Status: Closed
- Priority: P0
- Version: Beta
- Found Date: 2026-07-07
- Reporter: Internal QA
- Impact Scope: Production unauthenticated entry experience
- Reproduction Steps:
  1. Open the production site.
  2. Observe the unauthenticated entry screen.
  3. The old login page appears instead of the Welcome Page.
- Expected Result:
  Production should show the current Welcome Page before login.
- Actual Result:
  Production resolved the legacy login page.
- Root Cause Analysis:
  Production entry resolution loaded the legacy src/App.jsx because src/main.tsx imported ./App, which resolved to the old JSX file instead of the current TypeScript app.
- Modified Files:
  - src/main.tsx
- Involves Database Migration: NO
- Involves Environment Variables: NO
- Affects Production: YES
- Verification Method:
  Rebuilt locally, deployed latest commit, then opened production and confirmed the Welcome Page was rendered.
- Verification Result:
  PASS. Production now shows the Welcome Page.
- Fix Commit:
  e00a7b556b259282298147754477cb5b53e3a276
- Notes:
  Closed after production verification.

### BUG-002
- Bug ID: BUG-002
- Title: Production chat did not persist user memory
- Status: Closed
- Priority: P0
- Version: Beta
- Found Date: 2026-07-07
- Reporter: Internal QA
- Impact Scope: Production chat memory persistence and cross-chat recall
- Reproduction Steps:
  1. Send a message on production.
  2. Check dongni_user_memory and dongni_memory_events for that user.
  3. No memory row or event is written.
- Expected Result:
  Production chat should persist memory rows and append memory events after replies.
- Actual Result:
  Production chat replied, but memory tables stayed empty.
- Root Cause Analysis:
  Production was still serving an older deployment that did not include the memory persistence path now present in the repository.
- Modified Files:
  - api/_memory.js
  - api/chat.js
  - deploy-memory.sql
  - supabase/memory.sql
  - supabase/migrations/20260707_01_memory.sql
- Involves Database Migration: YES
- Involves Environment Variables: NO
- Affects Production: YES
- Verification Method:
  Deployed the latest production build, sent production chat requests, and checked dongni_user_memory plus dongni_memory_events for newly written records.
- Verification Result:
  PASS. Production chat returns 200, memory rows exist, and memory events are appended.
- Fix Commit:
  e00a7b556b259282298147754477cb5b53e3a276
- Notes:
  Closed after production verification.

## Intake Queue

Add new beta issues below before changing code.
