# Push Reminders Scheduler

## Goal
Run appointment reminder sweep every few minutes so push reminders are sent even when no user is actively using the app.

## Backend Endpoint
- URL: `/internal/reminders/appointments/sweep`
- Method: `GET`
- Auth: `Authorization: Bearer <secret>`

The endpoint is protected by:
- `APPOINTMENT_REMINDER_SWEEP_SECRET` (preferred)
- fallback `CRON_SECRET`

## Current Production URL
Use:
- `https://backend-delta-two-35.vercel.app/internal/reminders/appointments/sweep`

## GitHub Actions Setup
Workflow file:
- `.github/workflows/appointment-reminder-sweep.yml`

Required repository secrets:
1. `REMINDER_SWEEP_URL`
2. `REMINDER_SWEEP_SECRET`

Suggested values:
1. `REMINDER_SWEEP_URL=https://backend-delta-two-35.vercel.app/internal/reminders/appointments/sweep`
2. `REMINDER_SWEEP_SECRET=<same value configured in Vercel env>`

## Notes
- GitHub Actions minimum cron interval is 5 minutes.
- For 1-minute reminders, use Vercel Pro cron or a dedicated scheduler service with 1-minute interval.

