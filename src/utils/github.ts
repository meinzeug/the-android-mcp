import { execSync } from 'child_process';

function escapeShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function toCsv(values?: string[]): string | undefined {
  if (!values || values.length === 0) return undefined;
  return values.join(',');
}

export function createGitHubIssue(options: {
  repo?: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  dryRun?: boolean;
}): { repo: string; title: string; url?: string; output: string; command: string; dryRun?: boolean } {
  const repo = options.repo ?? 'meinzeug/the-android-mcp';
  const title = options.title.trim();
  const body = options.body?.trim() ?? '';
  const labels = toCsv(options.labels);
  const assignees = toCsv(options.assignees);

  if (!title) {
    throw new Error('Issue title must not be empty');
  }

  const args = [
    'gh',
    'issue',
    'create',
    '--repo',
    repo,
    '--title',
    title,
    '--body',
    body || ' ',
  ];

  if (labels) {
    args.push('--label', labels);
  }

  if (assignees) {
    args.push('--assignee', assignees);
  }

  const command = args.map(escapeShellArg).join(' ');
  if (options.dryRun) {
    return { repo, title, output: 'dryRun', command, dryRun: true };
  }

  const output = execSync(command, { encoding: 'utf8' }).trim();

  return { repo, title, url: output.split('\n').pop() ?? output, output, command };
}
