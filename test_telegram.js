const https = require('https');

const token = '8177293152:AAENNutIkUI7Rr95tGXmyzIyPLpN6KtPESE';
const chatId = '8102435386';

console.log(`Starting Telegram Diagnosis for Bot: ${token.split(':')[0]}...`);

const options = {
  hostname: 'api.telegram.org',
  port: 443,
  path: `/bot${token}/sendMessage`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`PROBLEM WITH REQUEST: ${e.message}`);
});

req.on('socket', (socket) => {
    socket.setTimeout(10000);  
    socket.on('timeout', () => {
        console.log('Socket timed out');
        req.destroy();
    });
});

const body = JSON.stringify({
  chat_id: chatId,
  text: 'Diagnosis message direct from HTTPS'
});

req.write(body);
req.end();
