# Auth email templates

Paste each file into Supabase: Authentication, Emails, Templates. Custom SMTP must be on for templates to be editable.

| Template in Supabase | File | Subject line |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Welcome to Settled: confirm your email |
| Reset password | `reset-password.html` | Reset your Settled password |
| Change email address | `change-email.html` | Confirm your new Settled email |
| Magic link | `magic-link.html` | Your Settled sign-in link |
| Invite user | `invite-user.html` | You've been invited to Settled |
| Reauthentication | `reauthentication.html` | Confirm it's you on Settled |

The app uses Confirm signup, Reset password and Change email address today. The other three are here so every email matches.
They use Supabase's placeholders (`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .Token }}`) and inline styles, which email apps need.
