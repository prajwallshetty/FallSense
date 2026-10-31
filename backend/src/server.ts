import { createApp } from './app';
import { loadConfig } from './config';
import { createPgDb } from './db';
import { retryPendingNotifications } from './notifications';
import { createFcmSender, unconfiguredSender } from './push/sender';

const config = loadConfig();
const db = createPgDb(config.databaseUrl);
const push = config.firebaseServiceAccountJson ? createFcmSender(config.firebaseServiceAccountJson) : unconfiguredSender;
if (!config.firebaseServiceAccountJson) console.warn('FIREBASE_SERVICE_ACCOUNT_JSON is not set: pushes will be logged as failed.');

const app = createApp({ db, config, push });
app.listen(config.port, () => console.log(`SafeFall API listening on ${config.port}`));

setInterval(() => {
  retryPendingNotifications(db, push).catch((e) => console.error('notification retry failed', e));
}, 60_000).unref();
