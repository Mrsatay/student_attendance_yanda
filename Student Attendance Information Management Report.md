# STUDENT ATTENDANCE INFORMATION MANAGEMENT

#### COURSE DESIGN PROJECT REPORT

#### Submitted as a Course Design Report

#### Shenyang Aerospace University

#### By:

#### [Insert Student Name]

#### Student ID: [Insert Student ID]

#### Class: 2351520115

#### COMPUTER SCIENCE AND TECHNOLOGY

#### Project Period: September 7, 2026 - December 31, 2026

#### Supervisor: [Insert Supervisor Name]

#### SEPTEMBER 2026

---

## STATEMENT OF ORIGINALITY

I hereby declare that this project report entitled **Student Attendance Information Management** is my original work completed for the course design project. The system implementation, analysis, design, and documentation described in this report were prepared by me with academic guidance from my supervisor.

Except for information that is properly cited, this report does not contain material copied from another person or institution. All sources used to support the technical and academic discussion are listed in the References section. I accept responsibility for the accuracy and originality of the work presented in this report.

Candidate's Signature: ____________________

Date: ____________________

Supervisor's Signature: ____________________

Date: ____________________

---

## ABSTRACT

Student attendance is an important part of academic administration because it provides evidence of student participation, supports classroom monitoring, and helps teachers identify attendance problems at an early stage. However, attendance information is often recorded manually or stored in separate files. These methods can make it difficult to search for records, maintain consistent data, prevent duplicate entries, and produce useful summaries.

This project presents the design and implementation of a web-based Student Attendance Information Management system. The system provides a centralized workspace where authorized users can authenticate, record attendance, update or delete records, search by student ID or name, filter information by class, course, and status, and review attendance statistics. The system supports three attendance statuses: Punctual, Late, and Absent. It also provides CSV import and export functions, input validation, duplicate prevention, role-based access control, and an audit log for administrative actions.

The application was developed using Node.js and Express for the server layer, PostgreSQL for persistent data storage, and vanilla HTML, CSS, and JavaScript for the user interface. The backend exposes REST-style API endpoints for authentication, attendance operations, dashboard statistics, data import and export, and activity monitoring. Passwords are protected with the Node.js `scrypt` password-hashing function, while user sessions are managed with `express-session`. PostgreSQL constraints and indexes are used to strengthen data integrity and query performance.

The resulting system improves the organization, accessibility, and traceability of attendance information. It is lightweight enough for a course design project and small-scale academic use while providing a practical foundation for future improvements such as automated testing, richer reports, database backup, notification services, and more detailed attendance analysis.

**Keywords:** Student Attendance; Information Management; Node.js; Express; PostgreSQL; Role-Based Access Control; Data Validation; Audit Log

---

## TABLE OF CONTENTS

1. Chapter 1 Introduction
   1.1 Background of the Study
   1.2 Problem Statement
   1.3 Project Objectives
   1.4 Scope of the System
   1.5 Significance of the Project
2. Chapter 2 Technology Background
   2.1 Node.js and Express
   2.2 PostgreSQL Database
   2.3 HTML, CSS, and JavaScript
   2.4 REST-Style API Design
   2.5 Session-Based Authentication
   2.6 Role-Based Access Control
   2.7 Data Validation and Integrity Constraints
3. Chapter 3 System Analysis and Design
   3.1 System Structure
   3.2 System Architecture
   3.3 Functional Module Design
   3.3.1 Authentication Module
   3.3.2 Attendance Management Module
   3.3.3 Search and Filtering Module
   3.3.4 Dashboard Module
   3.3.5 Import and Export Module
   3.3.6 Audit Log Module
   3.4 Attendance Data Model
   3.5 User Roles and Permission Model
   3.6 User Interface Structure
   3.7 System Process Design
   3.7.1 Login Process
   3.7.2 Create Attendance Record
   3.7.3 Search and Filter Records
   3.7.4 Update Attendance Record
   3.7.5 Delete Attendance Record
   3.7.6 Import Attendance Data
4. Chapter 4 System Implementation and Testing
   4.1 Development Environment
   4.2 Database Initialization
   4.3 Implementation of User Authentication
   4.4 Implementation of Attendance Management
   4.4.1 Attendance Record Creation
   4.4.2 Attendance Record Editing
   4.4.3 Attendance Record Deletion
   4.4.4 Attendance List and Filtering
   4.5 Implementation of Validation and Duplicate Prevention
   4.6 Implementation of Dashboard Statistics
   4.7 Implementation of Import and Export
   4.8 Implementation of Audit Logging
   4.9 User Interface Implementation
   4.9.1 Login Page
   4.9.2 Overview Dashboard
   4.9.3 Attendance Records Page
   4.9.4 Add and Edit Attendance Dialog
   4.9.5 Activity Log Page
   4.9.6 Import and Export Interface
   4.10 System Testing
   4.10.1 Functional Test Cases
   4.10.2 Validation Test Cases
   4.10.3 Access Control Test Cases
   4.10.4 Testing Summary
5. Conclusion
   5.1 Project Achievements
   5.2 Limitations
   5.3 Future Improvements
6. Acknowledgements
7. Suggested Diagrams and Flowcharts
8. References

---

# CHAPTER 1 INTRODUCTION

## 1.1 Background of the Study

Attendance is one of the basic types of information managed by an educational institution. Teachers need attendance records to monitor student participation, identify students who frequently arrive late or are absent, and support academic decisions. Attendance information can also help administrators understand class participation patterns and evaluate whether additional communication or assistance is needed.

In a small class, a teacher may record attendance in a notebook or a simple spreadsheet. This approach can be sufficient for a short period, but it becomes less effective when the number of students, courses, and attendance dates increases. A manual or fragmented process makes it harder to search for a specific student, compare records by date, detect duplicated entries, and produce a reliable summary by class or attendance status.

A centralized information management system can address these problems by storing records in a structured database and presenting them through a consistent user interface. Instead of keeping separate copies of data, the teacher can use one application to create, view, update, search, and review attendance information. Data validation can reduce input errors, while database constraints can prevent duplicate attendance records for the same student, course, and date.

This project develops a lightweight web-based Student Attendance Information Management system. The application is designed for teachers and academic administrators who need a practical tool for everyday attendance operations. The system emphasizes clear workflows, simple navigation, reliable storage, and appropriate access control.

## 1.2 Problem Statement

The attendance management process can experience several problems when it depends mainly on paper records or unstructured files:

1. Attendance records may be scattered across different notebooks, spreadsheets, or text files.
2. Searching for a student by name or student ID may take unnecessary time.
3. Manual entry can produce incomplete, invalid, or inconsistent data.
4. Duplicate records can be created for the same student, course, and date.
5. Teachers may have difficulty obtaining a quick summary of punctual, late, and absent records.
6. Data files may not clearly show who created, modified, or deleted an attendance record.
7. Users without administrative responsibilities may receive more access than they require.
8. Importing data from a file may fail without identifying the specific invalid rows.

These problems show the need for a system that combines attendance CRUD operations, search and filtering, statistical summaries, input validation, role-based permissions, and activity tracking in one application.

## 1.3 Project Objectives

The main objective of this project is to design and implement a web-based Student Attendance Information Management system for academic use.

The specific objectives are:

1. To provide secure login using a username and password.
2. To allow authorized administrators to create, read, update, and delete attendance records.
3. To store student ID, student name, class, course, attendance date, and attendance status.
4. To support search by student ID or student name.
5. To provide filters by class, course, and attendance status.
6. To display attendance records in date order.
7. To provide summary statistics for total records, punctual records, late records, absent records, and tracked students.
8. To prevent invalid data and duplicate records.
9. To support importing attendance information from CSV or TXT content.
10. To support exporting attendance information as a CSV file.
11. To restrict management operations according to the user's role.
12. To record important administrative actions in an audit log.

## 1.4 Scope of the System

The scope of this project is limited to a lightweight web application for managing student attendance information.

The system includes:

1. A browser-based login interface.
2. Administrator and viewer roles.
3. Attendance records containing student ID, student name, class, course, date, and status.
4. The statuses `Punctual`, `Late`, and `Absent`.
5. Create, read, update, and delete functions for administrators.
6. Read and search functions for authenticated viewers.
7. Search by student ID or student name.
8. Filtering by class, course, and status.
9. A dashboard with attendance totals and class punctuality information.
10. CSV/TXT import with line-level failure reporting.
11. CSV export in a defined column order.
12. Audit logging for create, update, delete, and import operations.
13. PostgreSQL storage with automatically initialized tables and indexes.

The system does not include biometric identification, facial recognition, mobile applications, cloud deployment, automatic timetable integration, email notification, or integration with a university student information system. Attendance is entered by an authenticated user rather than collected from hardware devices.

## 1.5 Significance of the Project

This project is significant from several perspectives.

From the teacher's perspective, the system reduces the effort required to organize attendance records. A teacher can search for a student, filter records, and review status counts from one workspace.

From the administrator's perspective, the system provides stronger control over attendance data. Administrator-only operations, duplicate prevention, validation rules, and audit records improve accountability and data consistency.

From the student's academic environment, the system creates a clearer record of participation. The information can support discussions about attendance patterns and help identify students who may need academic attention.

From a technical and academic perspective, the project demonstrates the application of web development, relational database design, authentication, role-based access control, API design, data validation, and user interface principles in a practical information management problem.

# CHAPTER 2 TECHNOLOGY BACKGROUND

## 2.1 Node.js and Express

Node.js is a JavaScript runtime that allows JavaScript code to execute on the server. It is suitable for lightweight web applications because it provides an event-driven execution model and a large ecosystem of packages.

Express is a web framework for Node.js. In this project, Express is used to create the HTTP server, define API routes, parse JSON requests, serve static frontend files, and handle authentication middleware. The application uses separate middleware functions for authenticated users and administrator-only operations. This structure makes the permission requirements visible at the route level.

The project uses ECMAScript modules and relies on the following major packages:

1. `express` for the web server and routes.
2. `express-session` for session management.
3. `pg` for PostgreSQL connectivity.
4. `dotenv` for loading configuration from environment variables.

## 2.2 PostgreSQL Database

PostgreSQL is an open-source relational database management system. It supports structured tables, primary keys, foreign keys, constraints, transactions, indexes, and SQL aggregation. These features are appropriate for attendance data because the records have a stable structure and must maintain consistency.

The application creates four tables when it starts for the first time:

1. `users` stores usernames, password hashes, roles, and creation timestamps.
2. `attendance` stores the main attendance records.
3. `audit_logs` stores administrative actions and their details.
4. PostgreSQL indexes support common searches by date, student ID, and class.

The attendance table contains a unique constraint over `student_id`, `course`, and `attendance_date`. This constraint represents the rule that one student should not have two attendance records for the same course and date.

## 2.3 HTML, CSS, and JavaScript

The frontend uses standard browser technologies without a large UI framework. HTML provides the document structure, forms, navigation, tables, dialog elements, and dashboard sections. CSS controls the layout, colors, responsive behavior, table appearance, status labels, and login screen.

JavaScript controls the application behavior in the browser. It performs asynchronous requests to the API, updates the page without a full reload, displays validation errors, opens the attendance dialog, loads dashboard data, changes sections, and handles import and export actions.

Using vanilla frontend technologies keeps the application lightweight and makes the relationship between the interface and the backend API easy to understand for a course design project.

## 2.4 REST-Style API Design

The backend exposes HTTP endpoints organized around application resources:

1. `/api/auth/login` and `/api/auth/logout` handle authentication.
2. `/api/auth/me` returns the current session user.
3. `/api/attendance` reads and creates attendance records.
4. `/api/attendance/:id` updates or deletes one record.
5. `/api/stats` returns aggregated dashboard information.
6. `/api/options` returns available classes and courses.
7. `/api/audit` returns recent administrative activity.
8. `/api/import` processes attendance file content.
9. `/api/export` returns a CSV file.

The endpoints use HTTP methods that communicate the intended action. `GET` is used for retrieval, `POST` for creation or import, `PUT` for update, and `DELETE` for removal. JSON is used for most request and response bodies.

## 2.5 Session-Based Authentication

The system uses username and password authentication. During login, the submitted username is used to find a user record. The password is checked against the stored password hash. If the credentials are valid, the server stores a small user object in the session.

Passwords are not stored as plain text. The application uses Node.js `crypto.scryptSync` with a random salt to generate a password hash. Password verification uses a timing-safe comparison. The session cookie is configured as HTTP-only, uses the `sameSite` setting, and has an eight-hour maximum age.

For a production deployment, session storage should be moved from the default in-memory store to a durable session store, and the application should be served through HTTPS with a strong secret. These requirements are discussed further in the limitations and future improvements sections.

## 2.6 Role-Based Access Control

Role-Based Access Control, or RBAC, assigns permissions according to a user's role. It is simpler to manage than assigning every permission individually and helps prevent unauthorized operations.

This project defines two roles:

1. **Administrator:** can view records, create records, edit records, delete records, import data, export data, and view the audit log.
2. **Viewer:** can view, search, filter, and review dashboard information, but cannot change attendance data or access administrator-only functions.

The frontend hides administrator controls for viewers, but the main security control is implemented on the server through the `adminOnly` middleware. This is important because hiding a button in a browser is not sufficient protection by itself.

## 2.7 Data Validation and Integrity Constraints

Validation is applied before attendance data is inserted or updated. The validation rules include:

1. Student ID must contain 4 to 32 letters, numbers, or hyphens.
2. Student name must contain valid letter, space, period, apostrophe, or hyphen characters.
3. Class and course values must not be empty and must remain within their length limits.
4. Attendance date must use the `YYYY-MM-DD` format.
5. Attendance date cannot be in the future.
6. Attendance status must be `Punctual`, `Late`, or `Absent`.

Database constraints provide a second layer of protection. The status column uses a check constraint, required fields use `NOT NULL`, and the combined student/course/date values use a unique constraint. The application translates duplicate database errors into a readable message for the user.

# CHAPTER 3 SYSTEM ANALYSIS AND DESIGN

## 3.1 System Structure

The system is organized into the following functional areas:

1. Authentication and session management.
2. Attendance record management.
3. Search and filtering.
4. Dashboard statistics.
5. Data import and export.
6. Audit activity monitoring.

The browser user interface communicates with the Express backend through API requests. The backend validates the request, checks the session and role, performs database operations, and returns JSON or CSV output. PostgreSQL is the persistent source of truth for users, attendance records, and audit logs.

## 3.2 System Architecture

The application follows a simple three-layer structure:

1. **Presentation layer:** HTML, CSS, and JavaScript in the `public` directory.
2. **Application layer:** Express routes, middleware, validation functions, session logic, and statistics queries in `server.js`.
3. **Data layer:** PostgreSQL tables, constraints, indexes, and SQL queries.

The typical request flow is:

1. A user interacts with the browser interface.
2. The frontend sends an HTTP request to an API endpoint.
3. Express middleware checks authentication and role requirements.
4. The server validates incoming values.
5. PostgreSQL executes a query or transaction.
6. The server returns a result or an error message.
7. The frontend updates the visible interface.

Create, update, delete, and import operations are connected to audit logging. Attendance creation and import are performed inside database transactions so that the operation can be committed or rolled back as a unit.

## 3.3 Functional Module Design

### 3.3.1 Authentication Module

The authentication module provides login, logout, and current-session checks. A successful login opens the main application interface and displays the username and role. Invalid credentials produce an error message without opening the application.

### 3.3.2 Attendance Management Module

The attendance management module is the central component of the system. Administrators can create a record through a dialog form, edit an existing record, and delete a record after confirmation. All authenticated users can read records that match the current filters.

Each record includes:

| Field | Description |
|---|---|
| Student ID | Unique academic identifier of the student |
| Student name | Name of the student |
| Class | Class or cohort identifier |
| Course | Course associated with the attendance |
| Attendance date | Date on which attendance was recorded |
| Status | Punctual, Late, or Absent |

### 3.3.3 Search and Filtering Module

The records page provides a text search field and filter controls. The search field checks student ID and student name. The class, course, and status controls apply exact filters. Users can combine the controls to reduce the displayed results.

The interface also provides a reset function that clears all active search and filter values. The server orders the result by attendance date in descending order, with the record ID used as a secondary ordering value.

### 3.3.4 Dashboard Module

The dashboard presents a summary of the attendance database:

1. Total attendance records.
2. Number of punctual records.
3. Number of late records.
4. Number of absent records.
5. Number of distinct students tracked.
6. Punctuality rate by class.
7. Attendance volume for the most recent seven dates.

The class summary is ordered from the lowest punctuality rate first. This arrangement helps users notice classes that may need attention.

### 3.3.5 Import and Export Module

Administrators can import CSV or TXT content using the required column order:

```text
student_id,student_name,class_name,course,attendance_date,status
```

The import function accepts a header row and validates each data row. Valid rows are inserted, while invalid or duplicate rows are returned as failures with their line numbers and reasons. The result reports the number of imported records and failed rows.

The export function retrieves all attendance records in chronological order and generates a CSV file with the same six-column structure.

### 3.3.6 Audit Log Module

The audit log provides accountability for administrator operations. It records:

1. The user who performed the action.
2. The action type.
3. The related record ID when available.
4. Additional details such as the student ID and date.
5. The timestamp of the action.

The current interface displays the thirty most recent activity records to administrators.

## 3.4 Attendance Data Model

The main database entities are described below.

### Users

The `users` table contains `id`, `username`, `password_hash`, `role`, and `created_at`. The username is unique, and the role is restricted to `admin` or `viewer`.

### Attendance

The `attendance` table contains `id`, `student_id`, `student_name`, `class_name`, `course`, `attendance_date`, `status`, `created_by`, and `updated_at`. The `created_by` field references the user who created the record and uses `ON DELETE SET NULL`.

### Audit Logs

The `audit_logs` table contains `id`, `user_id`, `action`, `entity_id`, `details`, and `created_at`. The `user_id` reference also uses `ON DELETE SET NULL`, which preserves the activity record if a user is later removed.

### Relationships

One user can create many attendance records. One user can also create many audit log entries. An attendance record can have one creator, while the audit log can refer to an attendance record through `entity_id`. This model is sufficient for the current system and leaves room for a separate attendance history table in a future release.

## 3.5 User Roles and Permission Model

| Function | Administrator | Viewer |
|---|---:|---:|
| Login | Yes | Yes |
| View dashboard | Yes | Yes |
| View attendance records | Yes | Yes |
| Search and filter | Yes | Yes |
| Add record | Yes | No |
| Edit record | Yes | No |
| Delete record | Yes | No |
| Import data | Yes | No |
| Export CSV | Yes | No |
| View activity log | Yes | No |

The role is stored in the database and copied into the authenticated session after login. Server-side middleware checks it before administrator operations are executed.

## 3.6 User Interface Structure

The user interface has two main states:

1. **Login view:** contains the application identity, username field, password field, sign-in button, and error area.
2. **Application view:** contains the sidebar navigation, user information, dashboard, attendance records page, activity log, attendance dialog, and toast messages.

The design uses a restrained teal and neutral color palette, compact panels, readable tables, status pills, and responsive layouts. The main sections are:

1. Overview.
2. Attendance records.
3. Activity log for administrators.

The attendance form is displayed in a dialog so that the user can create or edit a record without leaving the records page.

## 3.7 System Process Design

### 3.7.1 Login Process

1. The user enters a username and password.
2. The frontend sends the credentials to `/api/auth/login`.
3. The server retrieves the user and verifies the password hash.
4. If verification succeeds, the server creates a session.
5. The application opens according to the user's role.
6. If verification fails, the login view displays an error message.

### 3.7.2 Create Attendance Record

1. An administrator selects **Add record**.
2. The system opens the attendance form.
3. The administrator enters the record values.
4. The frontend submits the values to the server.
5. The server validates the values.
6. PostgreSQL checks the unique student/course/date rule.
7. The record and audit entry are committed in one transaction.
8. The records table and dashboard are refreshed.

### 3.7.3 Search and Filter Records

1. A user enters a student ID or name, or chooses filters.
2. The frontend sends the selected values as query parameters.
3. The server builds a parameterized SQL query.
4. PostgreSQL returns matching records.
5. The frontend displays the result count and table rows.

### 3.7.4 Update Attendance Record

1. An administrator selects **Edit** for a record.
2. The system fills the dialog with the selected values.
3. The administrator changes the information.
4. The server validates the new values and updates the record.
5. An audit entry is created.
6. The interface reloads the affected data.

### 3.7.5 Delete Attendance Record

1. An administrator selects **Delete**.
2. The browser requests confirmation.
3. The server deletes the record if it exists.
4. An audit entry is created for the deleted record.
5. The table and dashboard are refreshed.

### 3.7.6 Import Attendance Data

1. An administrator selects a CSV or TXT file.
2. The browser reads the file as text.
3. The file content is sent to `/api/import`.
4. The server identifies a possible header row.
5. Each row is split into six columns.
6. Each row is validated and inserted when valid.
7. Invalid or duplicate rows are collected with line numbers.
8. The import transaction is committed and the result is returned.

# CHAPTER 4 SYSTEM IMPLEMENTATION AND TESTING

## 4.1 Development Environment

The system was implemented as a Node.js project with the following environment:

| Component | Technology |
|---|---|
| Runtime | Node.js 20 or later |
| Backend | Express 5 |
| Database | PostgreSQL |
| Database driver | `pg` |
| Frontend | HTML5, CSS3, vanilla JavaScript |
| Authentication | `express-session` and `crypto.scryptSync` |
| Configuration | `.env` and `dotenv` |
| Package manager | pnpm |

The project can be started after PostgreSQL is configured and the environment values are placed in `.env`. The default development address is `http://localhost:3000`.

## 4.2 Database Initialization

At startup, the application calls `ensureSchema()`. The function creates the required tables and indexes using `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. It then checks whether the configured administrator exists. If not, the first administrator is created from `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

This initialization approach makes the project easy to run in a course environment. A separate migration framework would be more appropriate for a larger production application because schema changes should be versioned and reviewed.

## 4.3 Implementation of User Authentication

The login endpoint receives the username and password as JSON. The username is trimmed before it is used in a parameterized SQL query. The password is verified against the stored `salt:hash` value.

The server stores the following values in the session:

```text
id
username
role
```

The `/api/auth/me` endpoint allows the frontend to determine whether a session already exists. The logout endpoint destroys the session and returns a successful response.

The `authenticated` middleware protects all data endpoints from unauthenticated access. The `adminOnly` middleware adds the administrator role requirement for data-changing and administrative operations.

## 4.4 Implementation of Attendance Management

### 4.4.1 Attendance Record Creation

The create endpoint receives the six attendance values and passes them to `cleanAttendance()`. The validation function returns a cleaned value object and an array of validation errors. If errors exist, the server responds with status `400`.

If validation succeeds, the server obtains a database client, begins a transaction, inserts the record, writes an audit log, and commits. A duplicate constraint violation is translated into a `409` response with a clear message.

### 4.4.2 Attendance Record Editing

The update endpoint uses the same validation function. It updates the selected attendance row and refreshes `updated_at` with the current database time. After a successful update, an `UPDATE_ATTENDANCE` audit entry is written.

The endpoint returns `404` when the requested record does not exist and `409` when the new values would create a duplicate record.

### 4.4.3 Attendance Record Deletion

The delete endpoint requires administrator permission. It deletes the record by ID and returns the student ID from the deleted row so that the action can be recorded in the audit log. A missing record produces a `404` response.

The browser asks for confirmation before sending the delete request. This reduces accidental deletion during normal use.

### 4.4.4 Attendance List and Filtering

The list endpoint accepts query parameters for `search`, `className`, `course`, `status`, `from`, and `to`. The query is assembled with parameter placeholders rather than concatenating user values into SQL. Search is applied to `student_id` and `student_name` using case-insensitive matching.

The frontend applies a short debounce to the text search so that the server is not called for every keystroke immediately. The result table displays the student's name and ID, class, course, date, status, and administrator actions when appropriate.

## 4.5 Implementation of Validation and Duplicate Prevention

The validation function applies regular expressions and length checks to student IDs and names. It checks the date format and prevents future dates. It also verifies that the status belongs to the allowed status set.

Validation takes place on both create and update. Import processing calls the same validation function for every row, which keeps manual entry and file import consistent.

Duplicate prevention is implemented at the database level with:

```sql
UNIQUE (student_id, course, attendance_date)
```

This design is stronger than checking duplicates only in the browser because the database remains the final authority when multiple requests are made.

## 4.6 Implementation of Dashboard Statistics

The `/api/stats` endpoint executes three grouped queries in parallel:

1. A summary query counts all records, each status, and distinct students.
2. A class query calculates total records, punctual records, and punctuality rate for each class.
3. A recent query counts records grouped by attendance date and returns the latest seven dates.

The frontend places the results into metric panels, class progress bars, and a recent-volume list. Empty states are displayed when no attendance data exists.

The punctuality rate is calculated with the following expression:

```text
Punctuality rate = Punctual records / Total records x 100
```

The calculation is performed by PostgreSQL for each class and rounded to one decimal place.

## 4.7 Implementation of Import and Export

The export endpoint selects the six attendance columns, orders them chronologically, escapes quotation marks, and creates a CSV response. The response includes a download filename containing the current date.

The import endpoint accepts text content rather than a multipart upload. It removes empty lines, detects whether the first line is a header, and processes each remaining row. Each row is split into columns and passed to the shared validation function.

A row can fail because of invalid input, a duplicate student/course/date combination, or a database error. Instead of stopping at the first invalid row, the system records the failure and continues processing the other rows. The response includes:

```text
imported
failed
failures
```

This gives the administrator enough information to correct the source file.

## 4.8 Implementation of Audit Logging

The `audit()` helper inserts action information into `audit_logs`. The system currently records:

1. `CREATE_ATTENDANCE`
2. `UPDATE_ATTENDANCE`
3. `DELETE_ATTENDANCE`
4. `IMPORT_ATTENDANCE`

The administrator activity page joins audit logs with users and displays the action, username, details, and timestamp. This provides a basic trace of important data changes without exposing the audit log to viewer accounts.

## 4.9 User Interface Implementation

The frontend is implemented in three files:

1. `public/index.html` defines the login page, navigation, dashboard, records table, activity table, dialog form, and hidden file input.
2. `public/styles.css` defines the responsive layout, color system, form controls, tables, status pills, dialog, and toast messages.
3. `public/app.js` defines API calls, login behavior, section switching, record operations, dashboard loading, filtering, import, export, and audit loading.

The interface is designed to remain usable on smaller screens. The sidebar changes to a compact top area on narrow screens, summary metrics use a two-column grid, and the attendance form changes to one column on mobile widths.

### 4.9.1 Login Page

Place a screenshot of the login page immediately after this subsection. The screenshot should show the application title, username field, password field, sign-in button, and the main visual identity of the application. Do not show a real password or any sensitive credential in the screenshot.

**Recommended figure:**

```text
Figure 4.1 Login Page of the Student Attendance Information Management System
```

**Screenshot content:**

1. Attendance Desk or application title.
2. Shenyang Aerospace University label.
3. Username input.
4. Password input with the password hidden.
5. Sign-in button.
6. General login page layout.

**Recommended placement:** Insert the screenshot directly after the first paragraph of Section 4.9.1.

### 4.9.2 Overview Dashboard

Place a screenshot of the overview dashboard after this subsection. This screenshot should demonstrate how the system summarizes attendance information after a user successfully logs in.

**Recommended figure:**

```text
Figure 4.2 Overview Dashboard of the Student Attendance Information Management System
```

**Screenshot content:**

1. Sidebar navigation.
2. Overview page title.
3. Total records metric.
4. Punctual metric.
5. Late metric.
6. Absent metric.
7. Punctuality by class panel.
8. Recent volume panel.
9. Current user role and date label.

**Recommended placement:** Insert the screenshot directly after the first paragraph of Section 4.9.2.

### 4.9.3 Attendance Records Page

Place a screenshot of the attendance records page after this subsection. The screenshot should show the main data management table and the available search and filtering controls.

**Recommended figure:**

```text
Figure 4.3 Attendance Records Page with Search and Filtering Controls
```

**Screenshot content:**

1. Search field for student ID or student name.
2. Class filter.
3. Course filter.
4. Status filter.
5. Reset button.
6. Attendance table.
7. Student name and student ID.
8. Class, course, date, and status columns.
9. Edit and Delete actions for an administrator account.

**Recommended placement:** Insert the screenshot directly after the first paragraph of Section 4.9.3.

### 4.9.4 Add and Edit Attendance Dialog

Place one or two screenshots of the attendance dialog after this subsection. One screenshot may show the empty form used to add a record, while another may show the same form populated for editing an existing record. If only one screenshot is available, use the add-record form because it displays all required input fields clearly.

**Recommended figures:**

```text
Figure 4.4 Add Attendance Record Dialog
Figure 4.5 Edit Attendance Record Dialog
```

**Screenshot content:**

1. Student ID field.
2. Student name field.
3. Class field.
4. Course field.
5. Date field.
6. Status dropdown with Punctual, Late, and Absent options.
7. Cancel button.
8. Save record button.

**Recommended placement:** Insert Figure 4.4 after the first paragraph of Section 4.9.4. Insert Figure 4.5 after the description of the edit form. If only one image is used, keep Figure 4.4 and remove Figure 4.5 from the final report.

### 4.9.5 Activity Log Page

Place a screenshot of the activity log after this subsection. This page should be captured using an administrator account after at least one create, update, delete, or import operation has been performed.

**Recommended figure:**

```text
Figure 4.6 Activity Log Page Showing Administrative Actions
```

**Screenshot content:**

1. Activity log page title.
2. Action column.
3. User column.
4. Details column.
5. Time column.
6. Example actions such as CREATE_ATTENDANCE, UPDATE_ATTENDANCE, DELETE_ATTENDANCE, or IMPORT_ATTENDANCE.

**Recommended placement:** Insert the screenshot directly after the first paragraph of Section 4.9.5.

### 4.9.6 Import and Export Interface

Place a screenshot of the attendance records page showing the Import and Export CSV buttons after this subsection. If possible, add a second screenshot showing the import result message after a file has been processed.

**Recommended figures:**

```text
Figure 4.7 Import and Export Controls
Figure 4.8 Import Result Showing Successful and Failed Rows
```

**Screenshot content for Figure 4.7:**

1. Import button.
2. Export CSV button.
3. Attendance records table.
4. Administrator account indicator.

**Screenshot content for Figure 4.8:**

1. Imported record count.
2. Failed record count.
3. Validation or duplicate failure messages.
4. Line numbers for invalid rows when available.

**Recommended placement:** Insert Figure 4.7 after the first paragraph of Section 4.9.6. Insert Figure 4.8 after the paragraph describing the import result.

### Screenshot Presentation Requirements

For a consistent academic report, all screenshots should follow these rules:

1. Use the same browser zoom level for all screenshots.
2. Capture the complete relevant section without excessive unused space.
3. Use English interface labels that match the application.
4. Do not expose passwords, database passwords, session values, or private user information.
5. Use sample attendance data that is clearly fictional.
6. Add a caption below every screenshot.
7. Refer to each screenshot in the paragraph before or after it, for example: `As shown in Figure 4.2, the dashboard summarizes attendance records by status and class.`
8. Keep screenshot width consistent throughout Chapter 4.
9. If a screenshot is too wide for the page, crop only irrelevant browser areas while keeping the important interface labels visible.
10. Use PNG format where possible because it preserves text and interface details clearly.

## 4.10 System Testing

Testing for this project focuses on functional behavior, validation rules, access restrictions, data import handling, and database-integrated behavior. Because the repository does not currently contain an automated test suite, the test cases below define the recommended manual verification set for the implemented application. The final test result should be recorded after executing the application with a configured PostgreSQL database.

### 4.10.1 Functional Test Cases

| No. | Test Case | Expected Result |
|---:|---|---|
| 1 | Login with valid administrator credentials | The application opens and administrator controls are visible. |
| 2 | Login with invalid credentials | An error message appears and the login view remains open. |
| 3 | Login as a viewer | The application opens without administrator controls. |
| 4 | Add a valid attendance record | The record is saved and appears in the table. |
| 5 | Edit an existing record | The changed values appear in the table and an audit entry is created. |
| 6 | Delete an existing record | The record is removed and a delete audit entry is created. |
| 7 | Search by student ID | Matching records are displayed. |
| 8 | Search by student name | Matching records are displayed. |
| 9 | Filter by class, course, and status | Only records matching the selected filters are displayed. |
| 10 | Reset filters | All search and filter fields are cleared. |
| 11 | Open the dashboard with records | Summary metrics and class statistics are displayed. |
| 12 | Export attendance data | A CSV file is downloaded with the defined columns. |
| 13 | Import valid CSV rows | Valid rows are inserted and the imported count is returned. |
| 14 | Import a file with invalid rows | Valid rows are inserted and failed lines are reported. |
| 15 | Open the activity log as an administrator | Recent administrative actions are displayed. |

### 4.10.2 Validation Test Cases

| No. | Invalid Input | Expected Result |
|---:|---|---|
| 1 | Empty student ID | The request is rejected. |
| 2 | Student ID shorter than four characters | The request is rejected. |
| 3 | Student name with invalid symbols | The request is rejected. |
| 4 | Empty class | The request is rejected. |
| 5 | Empty course | The request is rejected. |
| 6 | Invalid date format | The request is rejected. |
| 7 | Future attendance date | The request is rejected. |
| 8 | Unsupported attendance status | The request is rejected. |
| 9 | Existing student/course/date combination | The request is rejected as a duplicate. |
| 10 | Empty import file | The server returns an error. |

### 4.10.3 Access Control Test Cases

| No. | Test Case | Expected Result |
|---:|---|---|
| 1 | Unauthenticated request to attendance endpoint | The server returns `401`. |
| 2 | Viewer requests attendance records | The server returns the records. |
| 3 | Viewer creates an attendance record | The server returns `403`. |
| 4 | Viewer edits an attendance record | The server returns `403`. |
| 5 | Viewer deletes an attendance record | The server returns `403`. |
| 6 | Viewer requests the audit log | The server returns `403`. |
| 7 | Administrator requests the audit log | The server returns the recent activity rows. |

### 4.10.4 Testing Summary

The implementation contains the main functional paths required by the project assignment. The application includes server-side authentication checks, administrator-only mutation routes, shared validation logic, database-level duplicate prevention, transaction-based import and creation, and readable error responses.

However, the repository does not currently include an automated test runner or a recorded test execution report. Therefore, claims about final pass rates should only be made after the test cases have been executed against a running PostgreSQL instance. Adding automated endpoint tests would improve reproducibility and provide stronger evidence for future versions of the project.

# CONCLUSION

## 5.1 Project Achievements

The Student Attendance Information Management project provides a practical web-based solution for organizing academic attendance records. The system successfully establishes a central data store and a browser interface for attendance operations.

The main achievements are:

1. A login system with administrator and viewer roles.
2. A PostgreSQL-backed attendance data model.
3. Complete administrator CRUD operations.
4. Viewer read and search access.
5. Search by student ID or student name.
6. Filtering by class, course, and attendance status.
7. Validation for required fields, date format, date range, and allowed statuses.
8. Duplicate prevention for a student, course, and date.
9. Dashboard summary statistics and class punctuality information.
10. CSV/TXT import with line-level failure reporting.
11. CSV export with a consistent format.
12. Audit logging for important administrator actions.
13. A responsive interface that remains lightweight and easy to operate.

The project demonstrates how common software engineering concepts can be combined to solve a real academic administration problem. It goes beyond a temporary in-memory CRUD program by providing persistent database storage, access control, traceability, and summary information.

## 5.2 Limitations

The current version has several limitations:

1. The system does not contain an automated test suite in the repository.
2. The default Express session store is intended for development rather than production.
3. The system does not provide a separate student master table, so student details are stored with each attendance record.
4. The current interface does not provide a dedicated date-range filter even though the backend accepts `from` and `to` parameters.
5. The import parser is intentionally simple and does not implement a complete CSV parser for every possible quoted comma scenario.
6. The audit log records actions but does not preserve a full before-and-after value history for updates.
7. There is no PDF report generation or scheduled report delivery.
8. There are no email, push, or in-application notifications.
9. The application has not been subjected to load testing, penetration testing, or production security auditing.
10. PostgreSQL must be configured separately before the application can start successfully.

These limitations do not prevent the application from serving as a course design project, but they identify areas that require attention before deployment in a larger institutional environment.

## 5.3 Future Improvements

Future development may include:

1. Add automated unit, integration, and end-to-end tests.
2. Add database migration tooling and seed data for repeatable setup.
3. Use a production-ready session store such as PostgreSQL or Redis.
4. Add a dedicated student table and course/class management tables.
5. Add date-range controls to the frontend records page.
6. Add attendance percentage calculations per student.
7. Add reports grouped by student, class, course, and date range.
8. Add PDF and spreadsheet report generation.
9. Improve CSV parsing with a dedicated parser library.
10. Add backup and restore operations.
11. Extend audit logs to include before-and-after values for updates.
12. Add account management and password reset workflows.
13. Add notifications for repeated absence or late attendance.
14. Deploy the application with HTTPS, secure secrets, monitoring, and a production database configuration.

# ACKNOWLEDGEMENTS

I would like to express my sincere gratitude to my supervisor for providing guidance and feedback during the development of this Student Attendance Information Management project. The advice received during the planning, implementation, and documentation stages helped clarify the project requirements and improve the final system design.

I would also like to thank Shenyang Aerospace University and the Computer Science and Technology program for providing the academic environment in which this project was completed. Finally, I am grateful to my classmates, family, and friends for their support and encouragement throughout the project period.

# SUGGESTED DIAGRAMS AND FLOWCHARTS

This section lists the diagrams and flowcharts that can be added to the final report. The diagrams do not need to be drawn manually inside this Markdown file. They can be generated later using ChatGPT, draw.io, Microsoft Visio, Figma, Canva, or another diagram tool, then inserted into the report with figure captions.

## Standard Diagram Prompt Requirements

Use the following visual requirements for every generated system design, architecture diagram, flowchart, and UI wireframe:

1. Follow a clean draw.io-style technical diagram.
2. Use only black, white, and grayscale colors.
3. Use black outlines, black text, white or light-gray fills, and simple gray connector arrows.
4. Use a transparent background. Do not add colored backgrounds, gradients, shadows, illustrations, or decorative elements.
5. Use standard UML, flowchart, database, or draw.io symbols where appropriate.
6. Use clear English labels with readable font sizes.
7. Do not include figure numbers, numbering labels, chapter numbers, captions, or titles containing numbers inside the generated image.
8. Do not place labels such as `Figure 3.1`, `Figure 3.2`, or `Figure 4.1` inside the diagram.
9. The figure number and caption will be added separately below the image in the report.
10. Keep the layout horizontal or top-to-bottom, aligned, uncluttered, and suitable for printing in an academic report.

The following sentence can be appended to any diagram prompt:

```text
Follow a clean draw.io-style technical diagram. Use only black, white, and grayscale colors with black outlines and simple gray arrows. Use a transparent background and no gradients, shadows, illustrations, or decorative elements. Do not include any figure number, numbering, chapter number, caption, or numbered title inside the image; the figure number will be added separately in the report.
```

## Recommended Figures

| Figure | Recommended Location | Purpose |
|---|---|---|
| Figure 3.1 System Architecture Diagram | Section 3.2 | Explain the relationship between browser, Express server, and PostgreSQL database. |
| Figure 3.2 Login Process Flowchart | Section 3.7.1 | Explain authentication and session creation. |
| Figure 3.3 Create Attendance Record Flowchart | Section 3.7.2 | Explain administrator record creation, validation, duplicate checking, and audit logging. |
| Figure 3.4 Search and Filtering Flowchart | Section 3.7.3 | Explain how users search and filter attendance data. |
| Figure 3.5 Update Attendance Record Flowchart | Section 3.7.4 | Explain edit, validation, update, and audit log flow. |
| Figure 3.6 Delete Attendance Record Flowchart | Section 3.7.5 | Explain confirmation, deletion, and audit log flow. |
| Figure 3.7 Import Attendance Data Flowchart | Section 3.7.6 | Explain CSV/TXT import, row validation, duplicate detection, and import result. |
| Figure 4.9 Main User Interface Layout | Section 4.9 | Show the main dashboard, records table, filters, and administrator actions. |

If the report has limited pages, the most important figures are Figure 3.1, Figure 3.2, Figure 3.3, and Figure 3.7 because they represent architecture, login, attendance creation, and data import.

## Figure 3.1 System Architecture Diagram

**Step-by-step diagram content:**

1. Draw three main layers: `Client Layer`, `Application Layer`, and `Data Layer`.
2. In the Client Layer, add `Administrator`, `Viewer`, and `Browser Interface`.
3. Under Browser Interface, add `HTML`, `CSS`, and `JavaScript`.
4. In the Application Layer, add `Node.js`, `Express Server`, `Authentication Middleware`, `Role-Based Access Control`, `Validation Logic`, `Attendance API`, `Statistics API`, `Import and Export`, and `Audit Logging`.
5. In the Data Layer, add `PostgreSQL Database`.
6. Inside PostgreSQL, add the tables `users`, `attendance`, and `audit_logs`.
7. Draw arrows from users to browser, browser to Express API, Express API to PostgreSQL, and PostgreSQL back to Express API and browser.
8. Add a note that administrator-only routes are protected by `adminOnly` middleware.

**Prompt to generate the diagram:**

```text
Create a clean draw.io-style academic system architecture diagram for a web-based Student Attendance Information Management System. Use three horizontal layers: Client Layer, Application Layer, and Data Layer. The Client Layer contains Administrator, Viewer, Browser Interface, HTML, CSS, and JavaScript. The Application Layer contains Node.js, Express Server, Authentication Middleware, Role-Based Access Control, Validation Logic, Attendance API, Statistics API, Import and Export, and Audit Logging. The Data Layer contains PostgreSQL Database with users, attendance, and audit_logs tables. Show directional arrows between the layers. Use black outlines, black text, white or light-gray fills, simple gray arrows, and a transparent background. Do not use color, gradients, shadows, illustrations, or decorative elements. Do not include any figure number, numbering, chapter number, caption, or numbered title inside the image; the figure number will be added separately in the report.
```

## Figure 3.2 Login Process Flowchart

**Step-by-step flowchart sequence:**

1. Start.
2. Display login page.
3. User enters username and password.
4. User submits login form.
5. Browser sends credentials to `/api/auth/login`.
6. Server queries user by username.
7. Server verifies password hash.
8. Decision: are credentials valid?
9. If no, display `Invalid username or password` and return to login page.
10. If yes, create session.
11. Read user role.
12. Display dashboard and role-based controls.
13. End.

**Prompt to generate the flowchart:**

```text
Create a clean draw.io-style flowchart for the login process of the Student Attendance Information Management System. Use standard flowchart symbols. The steps are: Start, Display Login Page, Enter Username and Password, Submit Credentials, Send Request to Login API, Query User Database, Verify Password Hash, Decision: Credentials Valid?, No -> Display Error Message -> Return to Login Page, Yes -> Create Session -> Read User Role -> Display Dashboard and Role-Based Controls -> End. Use English labels, black outlines, black text, white or light-gray fills, simple gray arrows, and a transparent background. Do not use color, gradients, shadows, or decorative elements. Do not include any figure number, numbering, chapter number, caption, or numbered title inside the image; the figure number will be added separately in the report.
```

## Figure 3.3 Create Attendance Record Flowchart

**Step-by-step flowchart sequence:**

1. Start.
2. Administrator selects `Add record`.
3. System displays attendance form.
4. Administrator enters student ID, student name, class, course, date, and status.
5. Administrator submits the form.
6. Server checks authentication.
7. Decision: is the user an administrator?
8. If no, return `403 Administrator permission required`.
9. If yes, validate all input values.
10. Decision: is the input valid?
11. If no, display validation errors and return to the form.
12. If yes, check duplicate student, course, and date.
13. Decision: does duplicate data exist?
14. If yes, display duplicate-record error.
15. If no, insert attendance record into PostgreSQL.
16. Write `CREATE_ATTENDANCE` audit log.
17. Commit transaction.
18. Display success message.
19. Refresh attendance table and dashboard.
20. End.

**Prompt to generate the flowchart:**

```text
Create a clean draw.io-style flowchart for the create attendance record process. The flowchart must show administrator authorization, form input, server-side validation, duplicate checking, database insertion, audit logging, transaction commit, success message, and dashboard refresh. Use this exact sequence: Start -> Administrator Selects Add Record -> Display Form -> Enter Attendance Data -> Submit Form -> Check Authentication and Administrator Role -> Decision: Authorized? -> No: Return 403 Error -> Yes: Validate Input -> Decision: Valid Input? -> No: Show Validation Errors -> Yes: Check Duplicate Student/Course/Date -> Decision: Duplicate Exists? -> Yes: Show Duplicate Error -> No: Insert Record -> Write Audit Log -> Commit Transaction -> Show Success Message -> Refresh Table and Dashboard -> End. Use standard flowchart symbols and English labels, black outlines, black text, white or light-gray fills, simple gray arrows, and a transparent background. Do not use color, gradients, shadows, or decorative elements. Do not include any figure number, numbering, chapter number, caption, or numbered title inside the image; the figure number will be added separately in the report.
```

## Figure 3.4 Search and Filtering Flowchart

**Step-by-step flowchart sequence:**

1. Start.
2. User opens attendance records page.
3. User enters student ID or student name.
4. User optionally selects class, course, or status filter.
5. Browser builds query parameters.
6. Browser sends `GET` request to `/api/attendance`.
7. Server builds parameterized SQL query.
8. PostgreSQL returns matching records.
9. Browser displays result count and table rows.
10. Decision: does user change search or filter?
11. If yes, repeat from search/filter input.
12. If no, end.

**Prompt to generate the flowchart:**

```text
Create a clean draw.io-style flowchart for the attendance search and filtering process. Show these steps: Start, Open Attendance Records, Enter Student ID or Name, Select Optional Class / Course / Status Filter, Build Query Parameters, Send GET Request to Attendance API, Build Parameterized SQL Query, Query PostgreSQL, Return Matching Records, Display Result Count and Table, Decision: Change Filter?, Yes -> Enter New Filter, No -> End. Use standard flowchart symbols, clear arrows, English labels, black outlines, black text, white or light-gray fills, simple gray arrows, and a transparent background. Do not use color, gradients, shadows, or decorative elements. Do not include any figure number, numbering, chapter number, caption, or numbered title inside the image; the figure number will be added separately in the report.
```

## Figure 3.5 Update Attendance Record Flowchart

**Step-by-step flowchart sequence:**

1. Start.
2. Administrator selects `Edit`.
3. System loads selected attendance record.
4. System displays the edit dialog.
5. Administrator modifies one or more fields.
6. Administrator submits updated form.
7. Server validates new values.
8. Decision: is the input valid?
9. If no, display validation errors.
10. If yes, update attendance record.
11. Decision: does the updated combination create a duplicate?
12. If yes, display duplicate error.
13. If no, write `UPDATE_ATTENDANCE` audit log.
14. Display success message.
15. Refresh attendance table and dashboard.
16. End.

**Prompt to generate the flowchart:**

```text
Create a clean draw.io-style flowchart for the update attendance record process. Include these steps: Start -> Administrator Selects Edit -> Load Selected Record -> Display Edit Dialog -> Modify Fields -> Submit Updated Form -> Validate Input -> Decision: Valid Input? -> No: Show Validation Errors -> Yes: Update Attendance Record -> Decision: Duplicate Student/Course/Date? -> Yes: Show Duplicate Error -> No: Write UPDATE_ATTENDANCE Audit Log -> Show Success Message -> Refresh Table and Dashboard -> End. Use standard flowchart symbols, English labels, black outlines, black text, white or light-gray fills, simple gray arrows, and a transparent background. Do not use color, gradients, shadows, or decorative elements. Do not include any figure number, numbering, chapter number, caption, or numbered title inside the image; the figure number will be added separately in the report.
```

## Figure 3.6 Delete Attendance Record Flowchart

**Step-by-step flowchart sequence:**

1. Start.
2. Administrator selects `Delete`.
3. Browser displays confirmation dialog.
4. Decision: does administrator confirm deletion?
5. If no, cancel operation and return to records table.
6. If yes, send delete request to `/api/attendance/:id`.
7. Server checks whether the record exists.
8. Decision: does the record exist?
9. If no, display `Attendance record not found`.
10. If yes, delete record from PostgreSQL.
11. Write `DELETE_ATTENDANCE` audit log.
12. Display success message.
13. Refresh attendance table and dashboard.
14. End.

**Prompt to generate the flowchart:**

```text
Create a clean draw.io-style flowchart for the delete attendance record process. Include these steps: Start -> Administrator Selects Delete -> Display Confirmation Dialog -> Decision: Confirm Deletion? -> No: Cancel Operation and Return to Records Table -> Yes: Send DELETE Request to Attendance API -> Check Record Exists -> Decision: Record Exists? -> No: Show Not Found Error -> Yes: Delete Record from PostgreSQL -> Write DELETE_ATTENDANCE Audit Log -> Show Success Message -> Refresh Table and Dashboard -> End. Use standard flowchart symbols and English labels, black outlines, black text, white or light-gray fills, simple gray arrows, and a transparent background. Do not use color, gradients, shadows, or decorative elements. Do not include any figure number, numbering, chapter number, caption, or numbered title inside the image; the figure number will be added separately in the report.
```

## Figure 3.7 Import Attendance Data Flowchart

**Step-by-step flowchart sequence:**

1. Start.
2. Administrator selects CSV or TXT file.
3. Browser reads file as text.
4. Browser sends content to `/api/import`.
5. Decision: is file empty?
6. If yes, display empty-file error and end.
7. If no, detect whether a header row exists.
8. Read next data row.
9. Split row into six columns.
10. Validate row.
11. Decision: is row valid?
12. If no, record line number and validation reason.
13. If yes, attempt to insert row into PostgreSQL.
14. Decision: is row duplicate?
15. If yes, record duplicate failure.
16. If no, increase imported count.
17. Decision: are more rows available?
18. If yes, repeat from reading next row.
19. If no, write `IMPORT_ATTENDANCE` audit log.
20. Commit transaction.
21. Display imported count and failed count.
22. End.

**Prompt to generate the flowchart:**

```text
Create a clean draw.io-style flowchart for the attendance data import process. Show the complete CSV/TXT import workflow: Start -> Select CSV or TXT File -> Read File as Text -> Send Content to Import API -> Decision: File Empty? -> Yes: Show Error -> End; No: Detect Header -> Read Row -> Split into Six Columns -> Validate Row -> Decision: Valid? -> No: Record Line Failure -> Check More Rows; Yes: Insert into PostgreSQL -> Decision: Duplicate? -> Yes: Record Duplicate Failure -> Check More Rows; No: Increase Imported Count -> Check More Rows -> When No More Rows, Write Import Audit Log -> Commit Transaction -> Display Imported and Failed Counts -> End. Use standard flowchart symbols, English labels, black outlines, black text, white or light-gray fills, simple gray arrows, and a transparent background. Do not use color, gradients, shadows, or decorative elements. Do not include any figure number, numbering, chapter number, caption, or numbered title inside the image; the figure number will be added separately in the report.
```

## Figure 4.9 Main User Interface Layout

**Step-by-step diagram content:**

1. Draw a desktop browser window.
2. Add a left sidebar with `Overview`, `Attendance Records`, and `Activity Log`.
3. Add a top section containing page title and `Add record` button.
4. Add four dashboard cards: `Total Records`, `Punctual`, `Late`, and `Absent`.
5. Add a panel for `Punctuality by Class`.
6. Add a panel for `Last Seven Dates`.
7. Add a records table with columns: Student, Class, Course, Date, Status, and Actions.
8. Add search input and filters above the table.
9. Add administrator buttons: `Import`, `Export CSV`, `Edit`, and `Delete`.

**Prompt to generate the UI figure:**

```text
Create a clean draw.io-style grayscale UI wireframe for a web-based Student Attendance Information Management System. Show a left sidebar with Overview, Attendance Records, and Activity Log. Show a main dashboard area with four summary metric cards: Total Records, Punctual, Late, and Absent. Include a Punctuality by Class panel, a Recent Volume panel, a searchable attendance table, filter controls, and administrator buttons for Add Record, Import, Export CSV, Edit, and Delete. Use English labels, black outlines, black text, white or light-gray fills, and a transparent background. Do not use color, gradients, shadows, illustrations, or decorative elements. Do not include any figure number, numbering, chapter number, caption, or numbered title inside the image; the figure number will be added separately in the report.
```

# REFERENCES

[1] Node.js Contributors. (2026). *Node.js Documentation*. https://nodejs.org/docs/latest/api/

[2] Express.js Contributors. (2026). *Express Documentation*. https://expressjs.com/

[3] PostgreSQL Global Development Group. (2026). *PostgreSQL Documentation*. https://www.postgresql.org/docs/

[4] Mozilla Developer Network. (2026). *HTML, CSS, and JavaScript Documentation*. https://developer.mozilla.org/

[5] OWASP Foundation. (2026). *Authentication Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

[6] OWASP Foundation. (2026). *Input Validation Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

[7] Sandhu, R., Coyne, E. J., Feinstein, H. L., and Youman, C. E. (1996). Role-Based Access Control Models. *IEEE Computer*, 29(2), 38-47.

[8] Sommerville, I. (2015). *Software Engineering* (10th ed.). Pearson.

[9] Pressman, R. S., and Maxim, B. R. (2019). *Software Engineering: A Practitioner's Approach* (9th ed.). McGraw-Hill Education.

[10] Project source files: `server.js`, `public/index.html`, `public/app.js`, `public/styles.css`, and `README.md`.


