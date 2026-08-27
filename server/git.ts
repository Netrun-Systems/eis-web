import { execFile } from 'node:child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn a command with an argument array — never through a shell, so no user
 * input is ever shell-interpolated (charter §5 discipline; also just correct).
 */
export function run(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        let code = 0;
        if (error) {
          code = typeof error.code === 'number' ? error.code : 1;
          // Command not found / spawn failure: surface the message.
          if (stderr === '' && error.message) stderr = error.message;
        }
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

export function git(repoPath: string, args: string[]): Promise<ExecResult> {
  return run('git', args, repoPath);
}

export async function gitHeadShort(repoPath: string): Promise<string | null> {
  const r = await git(repoPath, ['rev-parse', '--short', 'HEAD']);
  return r.code === 0 ? r.stdout.trim() : null;
}

/** Porcelain status for one file; empty string means clean. */
export async function gitFileStatus(repoPath: string, relPath: string): Promise<string> {
  const r = await git(repoPath, ['status', '--porcelain', '--', relPath]);
  if (r.code !== 0) {
    throw new Error(`git status failed for ${relPath}: ${r.stderr.trim()}`);
  }
  return r.stdout.trim();
}

export async function gitDiffStat(repoPath: string, relPath: string): Promise<string> {
  const r = await git(repoPath, ['diff', '--stat', '--', relPath]);
  return r.code === 0 ? r.stdout.trim() : '';
}

const COMMIT_IDENTITY: NodeJS.ProcessEnv = {
  GIT_AUTHOR_NAME: 'EISWeb',
  GIT_AUTHOR_EMAIL: 'daniel@netrunsystems.com',
  GIT_COMMITTER_NAME: 'EISWeb',
  GIT_COMMITTER_EMAIL: 'daniel@netrunsystems.com',
};

/** `git add <file>` + `git commit` (that file only), returning the short hash. */
export async function gitAddAndCommit(
  repoPath: string,
  relPath: string,
  message: string,
): Promise<{ ok: true; commit: string } | { ok: false; detail: string }> {
  const add = await run('git', ['add', '--', relPath], repoPath, COMMIT_IDENTITY);
  if (add.code !== 0) {
    return { ok: false, detail: `git add failed: ${add.stderr.trim()}` };
  }
  const commit = await run(
    'git',
    ['commit', '-m', message, '--', relPath],
    repoPath,
    COMMIT_IDENTITY,
  );
  if (commit.code !== 0) {
    return {
      ok: false,
      detail: `git commit failed: ${(commit.stderr + commit.stdout).trim()}`,
    };
  }
  const head = await gitHeadShort(repoPath);
  if (head === null) return { ok: false, detail: 'commit succeeded but HEAD unreadable' };
  return { ok: true, commit: head };
}

export interface GitLogEntry {
  hash: string;
  date: string;
  subject: string;
}

export async function gitLogForFile(
  repoPath: string,
  relPath: string,
  n: number,
): Promise<GitLogEntry[]> {
  const r = await git(repoPath, [
    'log',
    `-n${n}`,
    '--format=%h%x09%aI%x09%s',
    '--',
    relPath,
  ]);
  if (r.code !== 0) {
    throw new Error(`git log failed for ${relPath}: ${r.stderr.trim()}`);
  }
  return r.stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [hash, date, ...rest] = line.split('\t');
      return { hash: hash ?? '', date: date ?? '', subject: rest.join('\t') };
    });
}
