/**
 * @invoxa/shared - the rules both the API and the app import: money and totals,
 * statuses, numbering, formatting, label dictionaries and Zod schemas.
 *
 * Nothing in here talks to a database, a network or a device.
 */

export const APP_NAME = 'Invoxa';
export const APP_TAGLINE = 'Say it. Send it. Get paid.';
export const API_BASE_PATH = '/api/v1';

export * from './money.js';
export * from './totals.js';
export * from './status.js';
export * from './numbering.js';
export * from './format.js';
export * from './labels.js';
export * from './renderer.js';
export * from './ai.js';
export * from './recurring.js';
export * from './rules.js';
export * from './permissions.js';
export * from './retry.js';
export * from './backupParts.js';
export * from './schemas/index.js';
