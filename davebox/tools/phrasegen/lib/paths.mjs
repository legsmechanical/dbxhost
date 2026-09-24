/* paths — where the generator's research and the private material live, in
 * one place, so the tool can move without a hunt for literals. */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RESEARCH_DIR = process.env.PHRASEGEN_RESEARCH_DIR || join(HERE, '..', 'research');
export const PRIVATE_DIR = process.env.PHRASEGEN_PRIVATE_DIR || '';
