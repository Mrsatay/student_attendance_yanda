import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const directory = path.resolve('backups');
await mkdir(directory, { recursive: true });
const destination = path.join(directory, `attendance-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
const executable = process.env.PGBIN ? path.join(process.env.PGBIN, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump') : 'pg_dump';
const child = spawn(executable, ['--format=custom','--file',destination,'--dbname',process.env.PGDATABASE || 'student_attendance'], {
  env: { ...process.env,PGHOST:process.env.PGHOST || 'localhost',PGPORT:process.env.PGPORT || '5432',PGUSER:process.env.PGUSER || 'postgres' }, stdio:'inherit',windowsHide:true
});
child.on('error', (error) => { console.error('Backup could not start. Install PostgreSQL tools or set PGBIN to their directory.',error.code); process.exitCode=1; });
child.on('exit', (code) => { if (code === 0) console.log(`Backup created: ${destination}`); else process.exitCode=code || 1; });
