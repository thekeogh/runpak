export type EditorLib = {
  filePath: string;
  content: string;
};

export type IntellisenseResult = {
  packageName: string;
  libs: EditorLib[];
};

export async function loadIntellisense(packagePath: string): Promise<IntellisenseResult> {
  const response = await fetch(`/api/intellisense?path=${encodeURIComponent(packagePath)}`);
  const data = (await response.json()) as IntellisenseResult & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? `Could not load package types: ${response.status}`);
  }

  return data;
}
