# Security

Do not put vulnerabilities, private conversations, or credentials in public issues. Report security concerns through the app's support form using a verified account; the operator must establish a dedicated security contact before public launch.

Sessions use HttpOnly cookies; mutations validate Origin. The backend proxy key restricts direct API access, and WebSockets use short-lived, single-use tickets tied to an authenticated session. Socket heartbeats recheck session revocation and account standing. Every private route checks membership or ownership independently.

Messages are encrypted in transit but are not end-to-end encrypted. Moderators can review reported message snapshots. Cloudflare processes call traffic. Optional AI chat text goes through OpenRouter; human conversations are not sent there. Do not describe this design as anonymous from the operator or as end-to-end encrypted messaging.

The dependency lockfile is audited in CI. Explicit overrides currently use patched uuid, sharp, and esbuild versions; keep them until upstream dependency ranges adopt patched versions. Do not use `npm audit fix --force`, which currently proposes obsolete major downgrades of Cloudflare tooling.

Before public availability, set operator contacts, staff moderation and appeals, validate the age-assurance obligations of the launch jurisdictions, conduct abuse/load testing, and configure provider spending limits. Credential revocation and incident handling are documented in the operations runbook.
