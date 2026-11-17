# Demo seed data

The demo generator creates a complete synthetic dataset for demonstrations:

- 100 active students with student accounts
- 4 courses and 48 closed attendance sessions
- attendance records with punctual, late, absent, and excused cases
- approved leave requests
- 12 published quiz/homework activities
- submissions, scores, feedback, and weak-topic signals
- teacher activity segments for teaching, interaction, and board writing

Run it after starting the application once so the base schema and learning migration exist:

```bash
npm run seed:demo
```

Demo logins:

- Admin: use the existing administrator account
- Teacher: `DEMO-teacher` / `DemoTeacher123!`
- Student: `DEMO-STU-001` / `DEMO-STU-001`

All generated records use `DEMO-` identifiers or `Demo ` titles. To remove only the generated dataset and recreate it:

```bash
npm run seed:demo:reset
npm run seed:demo
```

Do not run the reset command against a production database.
