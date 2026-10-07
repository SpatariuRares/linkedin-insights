#!/usr/bin/env node
// Stands in for `codex exec --json` in tests. Behaviour is picked by FAKE_CODEX_MODE.
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const mode = process.env.FAKE_CODEX_MODE ?? 'ok';
  const out = (e) => process.stdout.write(JSON.stringify(e) + '\n');
  if (mode === 'auth') {
    process.stderr.write('Error: Not logged in. Run codex login\n');
    process.exit(1);
  }
  if (mode === 'slow') {
    setTimeout(() => {}, 60_000);
    return;
  }
  out({ type: 'thread.started', thread_id: 't' });
  out({
    type: 'item.completed',
    item: { type: 'error', message: 'Skill descriptions were shortened' },
  });
  out({
    type: 'item.completed',
    item: {
      type: 'agent_message',
      text: `args=${process.argv.slice(2).join(' ')}|stdin=${input.slice(0, 40)}`,
    },
  });
  out({ type: 'turn.completed', usage: { input_tokens: 321, output_tokens: 12 } });
});
