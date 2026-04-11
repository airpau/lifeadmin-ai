import { config } from 'dotenv';
config({ path: '.env' });
console.log("Imports loading...");
import('./src/lib/telegram/tool-handlers').then((mod) => {
  console.log("Loaded it!");
  console.log(typeof mod.executeToolCall);
}).catch(console.error);
