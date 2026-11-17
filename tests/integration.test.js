import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import pg from 'pg';
import crypto from 'node:crypto';
import readline from 'node:readline';

test('learning workflows, authorization, historical reports and restart persistence', { timeout:process.env.LEARNING_TEST_HOLD ? 900000 : 120000 }, async (t) => {
  const db = new pg.Pool({ connectionTimeoutMillis:5000, ssl:process.env.PGSSL === 'true' ? {rejectUnauthorized:false} : false });
  const schema = 'learning_test_' + crypto.randomBytes(8).toString('hex');
  const portServer = net.createServer(); portServer.listen(0,'127.0.0.1'); await once(portServer,'listening');
  const port = portServer.address().port; await new Promise((r) => portServer.close(r));
  let child, logs = '';
  const username = 'integration_admin', password = 'Integration-password-42';
  const start = async () => {
    logs = '';
    child = spawn(process.execPath,['server.js'],{ env:{...process.env,PGOPTIONS:`-c search_path=${schema}`,PORT:String(port),ADMIN_USERNAME:username,ADMIN_PASSWORD:password,NODE_ENV:'test'},stdio:['ignore','pipe','pipe'] });
    child.stdout.on('data',(s) => {logs += s;}); child.stderr.on('data',(s) => {logs += s;});
    for (let i=0;i<100;i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`); if (response.ok) return; } catch {}
      await new Promise((r) => setTimeout(r,100));
    }
    throw new Error('Server startup failed: '+logs);
  };
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child,'exit'); child.kill(); await exited; } };
  const client = () => {
    let cookie = '';
    return async (path,body,method = 'POST',expected = 200) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method:body === undefined ? 'GET' : method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body === undefined ? undefined : JSON.stringify(body) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const value = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
      assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(value)}${response.status >= 500 ? '\n'+logs : ''}`); return value;
    };
  };
  try {
    await db.query(`CREATE SCHEMA ${schema}`); await start();
    const admin=client(),teacher=client(),otherTeacher=client(),student=client(),second=client();
    await admin('/api/auth/login',{username,password});
    const firstStudent=await admin('/api/students',{studentId:'STU1001',name:'Student One',className:'Class A',email:''},'POST',201);
    const secondStudent=await admin('/api/students',{studentId:'STU1002',name:'Student Two',className:'Class A',email:''},'POST',201);
    await admin(`/api/learning/students/${firstStudent.id}/cohort`,{cohort:'2026'},'PUT');
    await admin(`/api/learning/students/${secondStudent.id}/cohort`,{cohort:'2026'},'PUT');
    const course=await admin('/api/courses',{code:'TEST01',name:'Learning Test',semester:'2026'},'POST',201);
    await admin(`/api/courses/${course.id}/roster`,{studentIds:[firstStudent.id,secondStudent.id]},'PUT');
    const session=await admin('/api/sessions',{courseId:course.id,className:'Class A',sessionDate:'2026-11-12',startTime:'08:00',endTime:'09:00',lateAfter:'08:15',method:'code'},'POST',201);
    assert.equal((await admin('/api/learning/catalog')).sessions.find((s) => s.id === session.id).session_date,'2026-11-12');
    assert.equal((await admin('/api/sessions')).rows.find((s) => s.id === session.id).sessionDate,'2026-11-12');
    const instructor=await admin('/api/learning/teachers',{username:'teacher_one',password},'POST',201);
    await admin('/api/learning/teachers',{username:'teacher_two',password},'POST',201);
    await admin(`/api/learning/courses/${course.id}/teachers`,{teacherIds:[instructor.id]},'PUT');
    await teacher('/api/auth/login',{username:'teacher_one',password}); await otherTeacher('/api/auth/login',{username:'teacher_two',password});
    await student('/api/auth/login',{username:'STU1001',password:'STU1001'}); await second('/api/auth/login',{username:'STU1002',password:'STU1002'});
    await t.test('authorization and session scoping',async () => {
      await student('/api/catalog',undefined,'GET',403);
      await student('/api/courses/'+course.id+'/roster',undefined,'GET',403);
      await otherTeacher('/api/sessions/'+session.id+'/start',{},'POST',403);
      assert.equal((await otherTeacher('/api/learning/catalog')).sessions.length,0);
      assert.equal((await student('/api/learning/catalog')).sessions[0].checkin_code,undefined);
      await student(`/api/learning/profiles/${secondStudent.id}`,undefined,'GET',403);
      await teacher('/api/sessions/'+session.id+'/start',{});
    });
    const png={name:'photo.png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII='};
    const uploadedPhoto=await admin(`/api/learning/students/${firstStudent.id}/photo`,png,'POST',201);
    await second(`/api/learning/files/${uploadedPhoto.id}`,undefined,'GET',403);
    await admin(`/api/learning/students/${firstStudent.id}/photo`,{name:'bad.png',data:Buffer.from('<svg/>').toString('base64')},'POST',400);
    const q=[{type:'mcq',prompt:'Which is a primary key?',topic:'Keys',points:10,options:['Unique','Duplicate'],correct:0},{type:'essay',prompt:'Explain the concept.',topic:'Keys',points:20,rubric:'Definition 10; example 10.'}];
    const activity=await teacher('/api/learning/activities',{sessionId:session.id,title:'Keys interaction',kind:'quiz',questions:q,allowRevision:true},'POST',201);
    await otherTeacher(`/api/learning/activities/${activity.id}`,undefined,'GET',403);
    await student(`/api/learning/activities/${activity.id}`,undefined,'GET',403);
    const instruction=await teacher(`/api/learning/activities/${activity.id}/files`,{name:'instructions.txt',data:Buffer.from('Explain with an example').toString('base64')},'POST',201);
    await teacher(`/api/learning/activities/${activity.id}/state`,{action:'open'});
    await t.test('student does not receive answer keys or peer information',async () => {
      const detail=await student(`/api/learning/activities/${activity.id}`);
      assert.equal(detail.activity.questions[0].correct,undefined); assert.equal(detail.participants.length,0);
      await second(`/api/learning/files/${instruction.id}`);
    });
    await admin(`/api/courses/${course.id}/roster`,{studentIds:[]},'PUT');
    const submission=await student(`/api/learning/activities/${activity.id}/submissions`,{answers:[0,'A primary key uniquely identifies a record.'],files:[{name:'work.txt',data:Buffer.from('My example').toString('base64')}]},'POST',201);
    let detail=await teacher(`/api/learning/activities/${activity.id}`);
    assert.equal(detail.metrics.participants,2); assert.equal(detail.metrics.completion,50); assert.equal(detail.metrics.accuracy,100); assert.equal(detail.metrics.pending,1);
    const attachment=detail.files.find((f) => f.submission_id === submission.id);
    await second(`/api/learning/files/${attachment.id}`,undefined,'GET',403);
    await student(`/api/learning/files/${attachment.id}`);
    const revision=await student(`/api/learning/activities/${activity.id}/submissions`,{answers:[1,'Revised explanation.']},'POST',201);
    await teacher(`/api/learning/submissions/${submission.id}/grade`,{grades:[{}, {score:15}],reason:'Old revision'},'PUT',409);
    await teacher(`/api/learning/submissions/${revision.id}/grade`,{grades:[{}, {score:30}],reason:'Invalid grade'},'PUT',400);
    await teacher(`/api/learning/submissions/${revision.id}/grade`,{grades:[{}, {score:15,feedback:'Add detail',needsPractice:true}],reason:'Initial assessment'},'PUT');
    assert.equal((await student(`/api/learning/activities/${activity.id}`)).submissions[0].answers[1].score,null);
    await teacher(`/api/learning/activities/${activity.id}/state`,{action:'close'});
    await teacher(`/api/learning/activities/${activity.id}/state`,{action:'publish'});
    assert.equal((await student(`/api/learning/activities/${activity.id}`)).submissions[0].answers[1].score,15);
    await teacher(`/api/learning/submissions/${revision.id}/grade`,{grades:[{}, {score:18,feedback:'Corrected',needsPractice:false}],reason:'Correction after review'},'PUT');
    detail=await teacher(`/api/learning/activities/${activity.id}`);
    assert.equal(detail.history.length,2); assert.equal(detail.submissions.length,2);
    await teacher(`/api/learning/activities/${activity.id}/state`,{action:'archive'});
    const profile=await student(`/api/learning/profiles/${firstStudent.id}`);
    assert.equal(profile.summary.attainment,60); assert.equal(profile.classAverage.participants,2); assert.equal(profile.summary.topics[0].status,'Insufficient data');
    assert.equal(profile.timeline[0].score,60);
    assert.equal(profile.attendance[0].session_date,'2026-11-12');
    assert.ok((await teacher(`/api/learning/activities/${activity.id}/export`)).includes('Not submitted'));
    const homework=await teacher('/api/learning/activities',{sessionId:session.id,title:'Keys homework',kind:'homework',questions:[q[1]],dueAt:new Date(Date.now()+60000).toISOString(),allowLate:false},'POST',201);
    await teacher(`/api/learning/activities/${homework.id}/state`,{action:'open'});
    await db.query(`UPDATE ${schema}.learning_activities SET due_at=now()-interval '1 minute' WHERE id=$1`,[homework.id]);
    await student(`/api/learning/activities/${homework.id}/submissions`,{answers:['Late answer']},'POST',409);
    await db.query(`UPDATE ${schema}.learning_activities SET allow_late=true WHERE id=$1`,[homework.id]);
    await student(`/api/learning/activities/${homework.id}/submissions`,{answers:['Late answer']},'POST',201);
    await student(`/api/learning/activities/${homework.id}/submissions`,{answers:['Duplicate']},'POST',409);
    await teacher(`/api/learning/activities/${homework.id}/state`,{action:'close'});
    await teacher(`/api/learning/activities/${homework.id}/state`,{action:'publish'},'POST',400);
    await t.test('timer, attendance snapshot, archive and export consistency',async () => {
      await teacher('/api/learning/timer',{sessionId:session.id,mode:'teaching'});
      await teacher('/api/learning/timer',{sessionId:session.id,mode:'interaction'});
      let analytics=await teacher('/api/learning/analytics'); assert.equal(analytics.running.mode,'interaction');
      await teacher('/api/sessions/'+session.id+'/close',{});
      analytics=await teacher('/api/learning/analytics'); assert.equal(analytics.running,null); assert.equal(analytics.segments.length,2);
      let preview=await admin('/api/reports/preview'); assert.equal(preview.count,2);
      await admin(`/api/courses/${course.id}/archive`,{reason:'Finished semester'},'POST',409);
      await teacher('/api/sessions/'+session.id+'/archive',{reason:'Finished semester'});
      preview=await admin('/api/reports/preview'); assert.equal(preview.count,2);
      const exported=await admin('/api/reports/export'); assert.equal(exported.split('\r\n').length,3); assert.ok(exported.includes('2026-11-12'));
      await admin('/api/reports/preview?from=2026-12-01&to=2026-01-01',undefined,'GET',400);
      await admin(`/api/courses/${course.id}/archive`,{reason:'Finished semester'});
    });
    await t.test('migration rerun and login persistence after restart',async () => {
      await stop(); await start();
      assert.equal((await teacher('/api/auth/me')).user.role,'teacher');
      assert.equal((await student(`/api/learning/profiles/${firstStudent.id}`)).timeline.length,1);
    });
    await t.test('common assessment compares classes within the same cohort',async () => {
      const third = await admin('/api/students',{studentId:'STU1003',name:'Student Three',className:'Class B'},'POST',201);
      await admin(`/api/learning/students/${third.id}/cohort`,{cohort:'2026'},'PUT');
      const sharedCourse = await admin('/api/courses',{code:'COMMON',name:'Common Assessment',semester:'2026'},'POST',201);
      await admin(`/api/courses/${sharedCourse.id}/roster`,{studentIds:[firstStudent.id,third.id]},'PUT');
      const createSession = (className) => admin('/api/sessions',{courseId:sharedCourse.id,className,sessionDate:'2026-11-14',startTime:'08:00',endTime:'09:00',lateAfter:'08:15',method:'code'},'POST',201);
      const sa=await createSession('Class A'), sb=await createSession('Class B');
      const common=await admin('/api/learning/activities',{sessionId:sa.id,additionalSessionIds:[sb.id],title:'Shared exam',kind:'quiz',questions:[q[0]]},'POST',201);
      await admin(`/api/learning/activities/${common.id}/state`,{action:'open'});
      const thirdClient=client(); await thirdClient('/api/auth/login',{username:'STU1003',password:'STU1003'});
      await student(`/api/learning/activities/${common.id}/submissions`,{answers:[0]},'POST',201);
      await thirdClient(`/api/learning/activities/${common.id}/submissions`,{answers:[1]},'POST',201);
      await admin(`/api/learning/activities/${common.id}/state`,{action:'close'});
      await admin(`/api/learning/activities/${common.id}/state`,{action:'publish'});
      const comparison=await student(`/api/learning/profiles/${firstStudent.id}?courseId=${sharedCourse.id}`);
      assert.equal(comparison.classAverage.attainment,100); assert.equal(comparison.cohortAverage.attainment,50);
      assert.equal(comparison.classAverage.participants,1); assert.equal(comparison.cohortAverage.participants,2);
    });
    if (process.env.LEARNING_TEST_HOLD) {
      await db.query(`UPDATE ${schema}.courses SET active=true WHERE id=$1`,[course.id]);
      await admin(`/api/courses/${course.id}/roster`,{studentIds:[firstStudent.id,secondStudent.id]},'PUT');
      await admin('/api/sessions',{courseId:course.id,className:'Class A',sessionDate:'2026-11-13',startTime:'08:00',endTime:'09:00',lateAfter:'08:15',method:'code'},'POST',201);
      console.log(`UI preview: http://127.0.0.1:${port}/ (integration_admin / Integration-password-42). Press Enter to remove the isolated test schema.`);
      const terminal=readline.createInterface({input:process.stdin,output:process.stdout});
      await new Promise((resolve) => terminal.question('',resolve)); terminal.close();
    }
  } finally {
    await stop();
    // Only this test's randomly named schema is removed; application tables are never touched.
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.end();
  }
});
