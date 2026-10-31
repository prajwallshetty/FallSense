// Administration CLI. Examples:
//   npm run admin -- create-user "Asha Rao"
//   npm run admin -- create-caretaker "Ravi Rao"
//   npm run admin -- link <userId> <caretakerId> son
//   npm run admin -- issue-code user <userId>
//   npm run admin -- revoke-code <credentialId>
//   npm run admin -- purge-readings 90
import { createPgDb } from '../src/db';
import { createCaretaker, createUser, issueAccessCode, linkCaretaker } from '../src/provisioning';

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  const pepper = process.env.ACCESS_CODE_PEPPER;
  if (!url || !pepper) throw new Error('DATABASE_URL and ACCESS_CODE_PEPPER must be set');
  const db = createPgDb(url);
  try {
    switch (command) {
      case 'create-user':
        console.log(await createUser(db, args[0]));
        break;
      case 'create-caretaker':
        console.log(await createCaretaker(db, args[0]));
        break;
      case 'link':
        await linkCaretaker(db, args[0], args[1], args[2] ?? '');
        console.log('linked');
        break;
      case 'issue-code':
        if (args[0] !== 'user' && args[0] !== 'caretaker') throw new Error('role must be user or caretaker');
        console.log('Give this code to the person now. It cannot be shown again:');
        console.log(await issueAccessCode(db, pepper, args[0], args[1]));
        break;
      case 'revoke-code':
        await db.query('update access_credentials set revoked_at = now() where id = $1', [args[0]]);
        console.log('revoked');
        break;
      case 'purge-readings': {
        const { rows } = await db.query<{ removed: string }>('select safefall_purge_sensor_readings($1) as removed', [Number(args[0] ?? 90)]);
        console.log(`removed ${rows[0].removed} readings`);
        break;
      }
      default:
        throw new Error(`unknown command: ${command}`);
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
