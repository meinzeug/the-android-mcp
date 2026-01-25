import { execSync } from 'child_process';

import { createGitHubIssue } from '../../src/utils/github';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('createGitHubIssue', () => {
  beforeEach(() => {
    (execSync as jest.Mock).mockReset();
  });

  it('returns command without executing when dryRun is true', () => {
    const result = createGitHubIssue({
      repo: 'meinzeug/the-android-mcp',
      title: 'Test issue',
      body: 'Hello',
      labels: ['bug'],
      dryRun: true,
    });

    expect(execSync).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.command).toContain('gh');
    expect(result.command).toContain('issue');
    expect(result.command).toContain('create');
  });

  it('executes gh command and returns url when dryRun is false', () => {
    (execSync as jest.Mock).mockReturnValue('https://github.com/meinzeug/the-android-mcp/issues/123');

    const result = createGitHubIssue({
      repo: 'meinzeug/the-android-mcp',
      title: 'Test issue',
      body: 'Hello',
    });

    expect(execSync).toHaveBeenCalledTimes(1);
    expect(result.url).toBe('https://github.com/meinzeug/the-android-mcp/issues/123');
    expect(result.command).toContain('gh');
  });
});
