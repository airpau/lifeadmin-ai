const fs = require('fs');
const content = fs.readFileSync('src/app/dashboard/disputes/page.tsx', 'utf8');

const threadStart = content.indexOf('      {/* Thread */}');
const nextSection = content.indexOf('      {/* Contract Upload Section */}');

if (threadStart !== -1 && nextSection !== -1) {
  const threadBlock = content.slice(threadStart, nextSection);
  let withoutThread = content.slice(0, threadStart) + content.slice(nextSection);
  
  // Insert before the legacy detail card
  const insertTarget = '      {/* Legacy detail card retained for the status-change dropdown + resolve';
  const insertIndex = withoutThread.indexOf(insertTarget);
  
  if (insertIndex !== -1) {
    const finalContent = withoutThread.slice(0, insertIndex) + threadBlock + '\n' + withoutThread.slice(insertIndex);
    fs.writeFileSync('src/app/dashboard/disputes/page.tsx', finalContent);
    console.log('Moved thread block successfully');
  } else {
    console.log('Could not find insertion point');
  }
} else {
  console.log('Could not find thread bounds', threadStart, nextSection);
}
