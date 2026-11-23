interface Issues {
  issues: readonly { path: readonly (string | number | symbol)[]; message: string }[];
}

/** Zod issues as inline field messages. The shared schemas are the only rules. */
export function zodFieldErrors(error: Issues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
