const https = require('https');
function check() {
  https.get('https://paybacker.co.uk/api/telegram/history', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.dir(json, {depth: null, maxArrayLength: null});
      } catch(e) {
        if (res.statusCode === 404 || data.includes('<html')) {
          console.log('Still building...');
          setTimeout(check, 5000);
        } else {
          console.log('Error parsing:', data);
        }
      }
    });
  }).on('error', (err) => {
    console.error(err);
    setTimeout(check, 5000);
  });
}
check();
