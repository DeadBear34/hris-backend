# Changelog

All notable changes to the HRIS backend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The full policy on when each number changes is published at [docs.hris.click/versioning](https://docs.hris.click/versioning).

In short, for `MAJOR.MINOR.PATCH`:

- **PATCH** for backward-compatible bug fixes and security fixes.
- **MINOR** for backward-compatible features. While the version is `0.x`, breaking changes also bump MINOR.
- **MAJOR** for breaking changes, starting from `1.0.0`.

Versions 0.1.0 through 0.6.1 were assigned retroactively from the pull requests merged into `main` when this policy was adopted.

## [Unreleased]

### Added

- Days are closed automatically inside the backend every 15 minutes, so absences are recorded without a server crontab. On startup the last `ATTENDANCE_BACKFILL_DAYS` days (default 7) are closed as well. Switch: `ATTENDANCE_AUTO_CLOSE`.

### Fixed

- A check-in rejected after the cutoff now records the day as absent immediately, as its message already said.
- Closing today no longer marks employees absent before their check-in cutoff has passed, and future dates are rejected.
- Days before an employee's join date are no longer marked absent.
- `GET /attendances/today` explains why check-in is closed when the day is already recorded as absent, on leave, or a holiday.
- Leave types reject unrealistic settings: the attachment threshold is limited to 365 days and must be lower than the max days per request, the max days per request cannot exceed the quota of a balance-deducting leave type, and the minimum notice is limited to 90 days.
- Clearing the attachment threshold of a leave type no longer causes a server error.
- Attendance corrections reject a check-in time outside the attendance date and a check-out time later than the following day.

## [0.7.1] - 2026-10-26

### Security

- Pinned Node.js to 22.23.4 in the Dockerfile and `.nvmrc` (October 21, 2026 security release, including CVE-2026-111497 in the Brotli decoder).
- Compressed request bodies (`Content-Encoding: br`, `gzip`, `deflate`) are rejected with 415 without being decompressed.
- Upgraded vulnerable dependencies: express 5.3.0 (body-parser 2.4.0), multer 2.5.0, zod 4.6.7, and handlebars 4.7.10 (development only).
- Sign-in with an unregistered email still runs the password check, so response timing no longer reveals which emails are registered.

### Fixed

- Balance refunds on rejection or cancellation are calculated from the request's own transactions rather than the leave type's current settings, and can no longer happen twice.
- Approver reassignment notifications are sent only to managers holding `leave.approve_team`, and tasks of `leave.approve_all` holders are no longer marked as read.
- Body parser rejections return 413 or 415 instead of 500.
- The cross-instance notification listener closes failed connections, so no sockets are left behind while the database is unreachable.
- Removed duplicated functions in the notification and approval routing helpers.

### Added

- The application version is exposed in `GET /health` (`version`) and in the OpenAPI document.
- `npm audit` check in CI and Dependabot configuration.

### Changed

- API reference texts (summaries, descriptions, and error messages in the OpenAPI document) are now in English.

## [0.7.0] - 2026-10-19

### Changed

- **BREAKING:** `POST /positions` now requires `department_id`. Position codes and names are unique within a unit instead of globally.
- Leave approvers are derived from the position structure (the superior position, skipping vacant ones). `manager_id` becomes a manual override.
- Pending leave requests are rerouted to the current line manager when the structure changes.

### Added

- Hierarchical organization structure: units (`parent_id`, `unit_type`), positions owned by units (`reports_to_position_id`, `is_unit_head`, `max_holders`), and structure rules V1 to V8.
- `GET /org/tree`, `GET /employees/:id/line-manager`, and `GET /positions/:id/line-manager`.
- Sign-in sessions and token revocation on sign-out are stored in Redis.
- `GET /auth/verification-code` for automated QA, restricted to administrators (`QA_TOOLS_ENABLED` switch).

### Fixed

- Leave approval notifications now reach every holder of `leave.approve_all`.
- Completed approval tasks are marked as read instead of being deleted.

### Migration

- Run `database/migrations/2026-10-18_hierarki_organisasi.sql`, or `database/schema.sql` for a new database.

## [0.6.1] - 2026-10-14

### Fixed

- Fixed the leave request submission flow.

## [0.6.0] - 2026-10-13

### Added

- API documentation (OpenAPI and Swagger) for holders of `system.view_api_docs`.
- Per-department concurrent leave limit (`max_concurrent_leave`) with per-leave-type exemptions.

### Fixed

- The HR leave summary shows every request, with a warning for overlapping leave of colleagues.

## [0.5.4] - 2026-10-13

### Fixed

- HR leave summary and concurrent leave warnings within a division.

## [0.5.3] - 2026-10-09

### Security

- Stronger password rules.

### Fixed

- Bugs reported by QA.

## [0.5.2] - 2026-10-07

### Added

- Public access through Cloudflare Tunnel.

### Security

- Fixed vulnerable dependencies.

## [0.5.1] - 2026-10-05

### Fixed

- Matched the Docker network MTU to the VM (1400).

## [0.5.0] - 2026-10-05

### Added

- Docker deployment and GitHub Actions CI/CD workflow.

## [0.4.2] - 2026-09-29

### Fixed

- Password reset, holidays, leave balances, and image paths.

## [0.4.1] - 2026-09-23

### Fixed

- Rate limiting and server startup handling.

## [0.4.0] - 2026-09-23

### Added

- Rate limiting per user and per IP.
- Optimistic concurrency control for edits.
- Real-time notifications over WebSocket.

## [0.3.0] - 2026-08-13

### Added

- Leave requests.
- Email verification with a one-time code.

## [0.2.0] - 2026-08-06

### Added

- Employee and department modules.
- Sign-in unit tests.

## [0.1.0] - 2026-08-05

### Added

- Registration with `full_name`, `phone`, `gender`, and terms acceptance.
- Request validation with Zod and centralized error handling.

[0.7.1]: https://github.com/DeadBear34/hris-backend/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/DeadBear34/hris-backend/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/DeadBear34/hris-backend/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/DeadBear34/hris-backend/compare/v0.5.4...v0.6.0
[0.5.4]: https://github.com/DeadBear34/hris-backend/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/DeadBear34/hris-backend/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/DeadBear34/hris-backend/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/DeadBear34/hris-backend/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/DeadBear34/hris-backend/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/DeadBear34/hris-backend/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/DeadBear34/hris-backend/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/DeadBear34/hris-backend/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/DeadBear34/hris-backend/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/DeadBear34/hris-backend/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/DeadBear34/hris-backend/releases/tag/v0.1.0
