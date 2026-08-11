import path from 'node:path';
import { promises as fs } from 'node:fs';

const openRouterEndpoint = 'openrouter';
const promptFilePattern = /^(?<model>.+)-v(?<version>\d+)\.md$/i;

export interface BasePrompt {
  model: string;
  text: string;
  version?: number;
}

interface PromptFile {
  model: string;
  path: string;
  version: number;
}

interface ResolveBasePromptParams {
  endpoint: string;
  model?: string;
  explicitPrompt?: string | null;
  promptsDirectory?: string;
}

const promptCache = new Map<string, Promise<Map<string, BasePrompt>>>();
const directoryCache = new Map<string, Promise<string | undefined>>();

function normalizeModel(model: string): string {
  return model.trim().toLowerCase().replace(/:[^/]+$/, '');
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function findPromptsDirectory(configuredDirectory?: string): Promise<string | undefined> {
  const environmentDirectory = process.env.RESEARCH_PROMPTS_DIR;
  const candidates = [
    configuredDirectory,
    environmentDirectory,
    path.resolve(process.cwd(), 'research', 'prompts'),
    path.resolve(process.cwd(), '..', 'research', 'prompts'),
    path.resolve(process.cwd(), '..', '..', 'research', 'prompts'),
  ].filter((candidate): candidate is string => candidate != null && candidate !== '');

  for (const candidate of candidates) {
    const directory = path.resolve(candidate);
    if (await isDirectory(directory)) {
      return directory;
    }
  }
  return undefined;
}

function resolvePromptsDirectory(configuredDirectory?: string): Promise<string | undefined> {
  const key = [configuredDirectory, process.env.RESEARCH_PROMPTS_DIR, process.cwd()].join('\0');
  let directory = directoryCache.get(key);
  if (!directory) {
    directory = findPromptsDirectory(configuredDirectory);
    directoryCache.set(key, directory);
  }
  return directory;
}

async function findPromptFiles(baseDirectory: string): Promise<PromptFile[]> {
  const providerEntries = await fs.readdir(baseDirectory, { withFileTypes: true });
  const promptFiles: PromptFile[] = [];

  for (const providerEntry of providerEntries) {
    if (!providerEntry.isDirectory()) {
      continue;
    }
    const provider = providerEntry.name.toLowerCase();
    const providerDirectory = path.join(baseDirectory, providerEntry.name);
    const fileEntries = await fs.readdir(providerDirectory, { withFileTypes: true });

    for (const fileEntry of fileEntries) {
      if (!fileEntry.isFile()) {
        continue;
      }
      const match = promptFilePattern.exec(fileEntry.name);
      const model = match?.groups?.model;
      const version = Number(match?.groups?.version);
      if (!model || !Number.isSafeInteger(version) || version < 0) {
        continue;
      }
      promptFiles.push({
        model: normalizeModel(`${provider}/${model}`),
        path: path.join(providerDirectory, fileEntry.name),
        version,
      });
    }
  }
  return promptFiles;
}

async function loadBasePrompts(promptsDirectory: string): Promise<Map<string, BasePrompt>> {
  const baseDirectory = path.join(promptsDirectory, 'base');
  if (!(await isDirectory(baseDirectory))) {
    return new Map();
  }

  const latestFiles = new Map<string, PromptFile>();
  for (const promptFile of await findPromptFiles(baseDirectory)) {
    const current = latestFiles.get(promptFile.model);
    if (current?.version === promptFile.version) {
      throw new Error(
        `Duplicate base prompt version v${promptFile.version} for ${promptFile.model}`,
      );
    }
    if (!current || promptFile.version > current.version) {
      latestFiles.set(promptFile.model, promptFile);
    }
  }

  const prompts = new Map<string, BasePrompt>();
  await Promise.all(
    Array.from(latestFiles.values()).map(async (promptFile) => {
      prompts.set(promptFile.model, {
        model: promptFile.model,
        text: await fs.readFile(promptFile.path, 'utf8'),
        version: promptFile.version,
      });
    }),
  );
  return prompts;
}

async function getBasePrompts(promptsDirectory: string): Promise<Map<string, BasePrompt>> {
  let prompts = promptCache.get(promptsDirectory);
  if (!prompts) {
    prompts = loadBasePrompts(promptsDirectory);
    promptCache.set(promptsDirectory, prompts);
  }
  return prompts;
}

export async function resolveBasePrompt({
  endpoint,
  model,
  explicitPrompt,
  promptsDirectory,
}: ResolveBasePromptParams): Promise<BasePrompt | undefined> {
  if (explicitPrompt?.trim()) {
    return {
      model: model ? normalizeModel(model) : '',
      text: explicitPrompt,
    };
  }
  if (endpoint.trim().toLowerCase() !== openRouterEndpoint || !model?.trim()) {
    return undefined;
  }

  const resolvedDirectory = await resolvePromptsDirectory(promptsDirectory);
  if (!resolvedDirectory) {
    return undefined;
  }
  return (await getBasePrompts(resolvedDirectory)).get(normalizeModel(model));
}

export function clearBasePromptCache(): void {
  promptCache.clear();
  directoryCache.clear();
}
