// Loads backend/.env for local runs (migrations, admin commands, development). Variables that are
// already set, such as a host platform's secrets, are never overridden. In a container there is no
// .env file and this does nothing. Resolves to backend/ from both src/ and dist/.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const file = join(__dirname, '..', '.env');
if (existsSync(file)) process.loadEnvFile(file);
