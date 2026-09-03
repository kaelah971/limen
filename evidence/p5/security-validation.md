# Security Validation

Synthetic credential rejection:

- Payload field: `privateKey`
- Value: synthetic and not a real credential
- HTTP result: `400`
- Persisted row: none

RLS inspection:

- `public.runs`: `rowsecurity=true`
- `public.decisions`: `rowsecurity=true`
- `public.telegraph_requests`: `rowsecurity=true`
- `pg_policies` rows for these tables: none

This confirms RLS is enabled without anonymous/public table policies or an
anonymous INSERT policy. Privileged access remains server-side.

No credentials, authorization headers, payment signatures, private wallet
material, or raw provider responses are included in this evidence package.
