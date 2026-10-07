import { spawn } from 'node:child_process';
import { LlmError } from './types.ts';

export type CliResult = { code: number | null; stdout: string; stderr: string };

/**
 * Runs a model CLI non-interactively: prompt on stdin, output collected, process killed if it
 * outlives `timeoutMs`. A missing binary becomes a readable error instead of a crash.
 */
export function runCli(
  bin: string,
  args: string[],
  opts: { stdin: string; timeoutMs: number; cwd?: string; label: string },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }, opts.timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new LlmError(
          err.code === 'ENOENT'
            ? `Non trovo il comando «${bin}» di ${opts.label}: è installato e nel PATH del server?`
            : `${opts.label} non si è avviato: ${err.message}`,
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new LlmError(
            `${opts.label} non ha risposto entro ${Math.round(opts.timeoutMs / 1000)} s.`,
          ),
        );
      } else {
        resolve({ code, stdout, stderr });
      }
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(opts.stdin);
  });
}

/** Last few lines of stderr, enough to explain a failure without dumping logs on the user. */
export function stderrTail(stderr: string, lines = 3): string {
  return stderr.trim().split('\n').slice(-lines).join(' ').slice(0, 400);
}
