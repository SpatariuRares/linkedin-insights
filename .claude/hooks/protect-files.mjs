// PreToolUse (Edit|Write): keeps Claude away from secrets and generated files, and asks before a
// change to server/migrations.ts that is not a pure append (shipped migrations must never change).
import fs from 'node:fs';
import path from 'node:path';

const { tool_name: tool, tool_input: input = {} } = JSON.parse(fs.readFileSync(0, 'utf8'));
const file = input.file_path;
if (!file) process.exit(0);

function decide(permissionDecision, permissionDecisionReason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        permissionDecisionReason,
      },
    }),
  );
  process.exit(0);
}

const base = path.basename(file);

if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) {
  decide('deny', `${base} contiene segreti (es. OPENROUTER_API_KEY): modificalo a mano.`);
}

if (base === 'package-lock.json') {
  decide('deny', 'package-lock.json si aggiorna solo con npm install / npm uninstall.');
}

if (file.endsWith(`${path.sep}server${path.sep}migrations.ts`) && fs.existsSync(file)) {
  const before = fs.readFileSync(file, 'utf8');
  let after;
  if (tool === 'Write') {
    after = input.content ?? '';
  } else if (tool === 'Edit') {
    const { old_string: from = '', new_string: to = '', replace_all: all } = input;
    after = all ? before.split(from).join(to) : before.replace(from, () => to);
  } else {
    process.exit(0);
  }
  // Append-only: everything up to the closing `];` of MIGRATIONS must survive unchanged.
  const head = before.slice(0, before.lastIndexOf('];')).trimEnd();
  if (!after.startsWith(head)) {
    decide(
      'ask',
      'Questa modifica tocca una migrazione esistente in server/migrations.ts. Le migrazioni già ' +
        'applicate non vanno mai cambiate: aggiungine una nuova in coda. Approva solo se la ' +
        'migrazione non è mai stata eseguita su un database reale.',
    );
  }
}

process.exit(0);
