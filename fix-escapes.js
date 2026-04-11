const fs = require('fs');

const files = [
  'src/app/api/cron/dispute-reminders/route.ts',
  'src/lib/email/dispute-reminders.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  // replace \` with `
  content = content.replace(/\\`/g, '`');
  // replace \$ with $
  content = content.replace(/\\\$/g, '$');
  fs.writeFileSync(file, content);
  console.log('Fixed', file);
}
