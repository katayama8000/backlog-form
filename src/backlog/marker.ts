// Backlog has no "public" flag, so a name prefix marks what the form may
// expose: the project, the issue type (one form each) and each custom field.
export const MARKER = "[form]";

// Returns the name without the marker, or undefined when it isn't marked.
export function unmark(name: string): string | undefined {
  const trimmed = name.trimStart();
  if (!trimmed.toLowerCase().startsWith(MARKER)) return undefined;
  return trimmed.slice(MARKER.length).trim();
}
