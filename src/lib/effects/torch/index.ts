// Torch is the default effect — its visual skin IS the core anatomy in core.css, so this
// entry ships no index.css. Importing it just guarantees core.css is present.
import '../core.css';
import { defineEffect } from '../define';
import { meta } from './meta';

export { meta };

/** The default `torch` effect (core anatomy; no extra skin CSS). */
export const torch = defineEffect({ meta });

export default torch;
