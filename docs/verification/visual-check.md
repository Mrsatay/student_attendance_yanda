# Visual verification - 2026-11-12

Used isolated PostgreSQL test schemas with synthetic accounts and records. The production database was not migrated.

Verified in the in-app browser:
- Admin login, mixed MCQ/essay authoring, draft save and opening submissions.
- Student login, own activity access, answer submission at a 390 x 844 viewport and unpublished-results messaging.
- Assigned teacher login, completion/accuracy counts, essay grading, publication, learning profile and teaching analytics.
- Desktop layout at 1366 x 900; mobile navigation, activity cards and administration forms at 390 x 844.

Fixed and rechecked:
- PostgreSQL DATE values previously shifted backwards one day during JSON serialization in UTC+7. Preserve calendar dates as strings; integration assertions now cover both catalogs and profile attendance.
- Shared mobile CSS hid navigation and logout on both workspaces. Navigation is now available as a wrapping grid.
- The attendance navigation handler incorrectly handled the Learning workspace link as an internal section. Bind it only to elements with data-section.

The final navigation check produced no new console errors. Eleven automated checks pass after the date/navigation changes. Screenshots contain synthetic fixture data only.

This is targeted acceptance testing, not exhaustive device/browser coverage. Upload/download edge cases and access-control denials are covered by API integration tests; they were not all repeated through the browser.
