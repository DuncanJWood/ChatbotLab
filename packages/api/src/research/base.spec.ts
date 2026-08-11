import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { clearBasePromptCache, resolveBasePrompt } from './base';

async function createPromptDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'librechat-research-'));
  await fs.mkdir(path.join(directory, 'base', 'anthropic'), { recursive: true });
  return directory;
}

describe('resolveBasePrompt', () => {
  afterEach(() => {
    clearBasePromptCache();
  });

  it('uses an explicitly supplied prompt before the model prompt', async () => {
    const result = await resolveBasePrompt({
      endpoint: 'OpenRouter',
      model: 'anthropic/claude-sonnet-4.6',
      explicitPrompt: 'Explicit instructions',
      promptsDirectory: '/missing',
    });

    expect(result).toEqual({
      model: 'anthropic/claude-sonnet-4.6',
      text: 'Explicit instructions',
    });
  });

  it('matches OpenRouter model names to the latest numeric prompt version', async () => {
    const directory = await createPromptDirectory();
    const providerDirectory = path.join(directory, 'base', 'anthropic');
    await Promise.all([
      fs.writeFile(path.join(providerDirectory, 'claude-sonnet-4.6-v2.MD'), 'version 2'),
      fs.writeFile(path.join(providerDirectory, 'claude-sonnet-4.6-v10.md'), 'version 10'),
      fs.writeFile(path.join(providerDirectory, 'claude-sonnet-4.6-v9.MD'), 'version 9'),
    ]);

    const result = await resolveBasePrompt({
      endpoint: 'OpenRouter',
      model: 'anthropic/claude-sonnet-4.6',
      promptsDirectory: directory,
    });

    expect(result).toEqual({
      model: 'anthropic/claude-sonnet-4.6',
      text: 'version 10',
      version: 10,
    });
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('matches OpenRouter routing variants to the underlying model', async () => {
    const directory = await createPromptDirectory();
    await fs.writeFile(
      path.join(directory, 'base', 'anthropic', 'claude-haiku-4.5-v3.MD'),
      'haiku prompt',
    );

    const result = await resolveBasePrompt({
      endpoint: 'openrouter',
      model: 'anthropic/claude-haiku-4.5:exacto',
      promptsDirectory: directory,
    });

    expect(result?.text).toBe('haiku prompt');
    expect(result?.version).toBe(3);
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('rejects duplicate versions for the same model', async () => {
    const directory = await createPromptDirectory();
    const providerDirectory = path.join(directory, 'base', 'anthropic');
    await Promise.all([
      fs.writeFile(path.join(providerDirectory, 'claude-sonnet-4.6-v2.MD'), 'first'),
      fs.writeFile(path.join(providerDirectory, 'CLAUDE-SONNET-4.6-v2.md'), 'second'),
    ]);

    await expect(
      resolveBasePrompt({
        endpoint: 'OpenRouter',
        model: 'anthropic/claude-sonnet-4.6',
        promptsDirectory: directory,
      }),
    ).rejects.toThrow('Duplicate base prompt version v2');
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('does not apply repository prompts to other endpoints', async () => {
    const directory = await createPromptDirectory();
    await fs.writeFile(
      path.join(directory, 'base', 'anthropic', 'claude-sonnet-4.6-v1.MD'),
      'base prompt',
    );

    const result = await resolveBasePrompt({
      endpoint: 'anthropic',
      model: 'anthropic/claude-sonnet-4.6',
      promptsDirectory: directory,
    });

    expect(result).toBeUndefined();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('returns no prompt when the model has no matching file', async () => {
    const directory = await createPromptDirectory();

    const result = await resolveBasePrompt({
      endpoint: 'OpenRouter',
      model: 'openai/gpt-5',
      promptsDirectory: directory,
    });

    expect(result).toBeUndefined();
    await fs.rm(directory, { recursive: true, force: true });
  });
});
