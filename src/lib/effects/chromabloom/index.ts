// Side-effect CSS: core anatomy first (so the effect's own rules win equal-specificity ties by
// source order), then this effect's skin. Bundlers dedupe core.css to a single copy.
import '../core.css';
import './index.css';
import { defineEffect } from '../define';
import { meta } from './meta';

export { meta };

export const chromabloom = defineEffect({ meta });

export default chromabloom;
