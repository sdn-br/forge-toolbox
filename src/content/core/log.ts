const PREFIX = '[Forge Toolbox]';

export function logError(message: string, error?: unknown) {
  console.error(PREFIX, message, error);
}

export function logInfo(message: string, ...details: unknown[]) {
  console.info(PREFIX, message, ...details);
}
