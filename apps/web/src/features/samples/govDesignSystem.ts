/**
 * The government design system stylesheet, as a string.
 *
 * The CSS lives in `govDesignSystem.css` for authoring (editor support, linting,
 * easy review) and is mirrored into `govDesignSystem.json` by
 * `scripts/sync-gov-css.mjs` for consumption.
 *
 * JSON is used rather than a `?raw` import because `?raw` resolves to an empty
 * string under Vitest, and `node:fs` cannot be imported in app code (Vite
 * externalises it for the browser). A JSON import works identically in Vite,
 * Vitest and the Node build script, so the tests assert against the same bytes
 * the app ships.
 */
import stylesheet from "./govDesignSystem.json";

export const GOV_GLOBAL_CSS: string = stylesheet.css;
