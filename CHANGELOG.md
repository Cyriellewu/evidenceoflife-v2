# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open-source foundation: MIT `LICENSE`, `CONTRIBUTING`, `CODE_OF_CONDUCT`,
  `SECURITY`, `PRIVACY`, issue/PR templates, and contributor-facing docs.
- Self-hosting guide (`docs/oss/self-hosting.md`) and expanded `.env.example`.
- Shared edge-function auth helpers; JWT checks on `link-preview` / `life-replay`.
- HMAC-signed Google Calendar OAuth `state` + redirect origin allowlist.
- Private `moment-photos` bucket + signed URL display helper (`StorageImage`).

### Security
- Dropped client write policies on `google_calendar_tokens` (service-role only).
- `image-proxy` requires anon `apikey` and Origin/Referer allowlist.
- Removed tracked maintainer/agent scratch from the product tree.

### Changed
- README getting-started now includes `npm install`, demo path, and OSS links.
- CI typecheck uses `npm run typecheck`; Node 20 pinned via `.nvmrc`.

> Note: Prior history exists in git commits but was not tracked in a changelog.
> The first tagged release should summarize the current feature set (Today,
> Recap, Dues, Habits, Map, Calendar, Year, Notes, Links, Google Calendar sync)
> rather than reconstruct every past commit.
