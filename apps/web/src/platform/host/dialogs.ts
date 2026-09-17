/**
 * Dialog API.
 *
 * The original host used VS Code's `showInputBox`, `showQuickPick` and
 * `showOpenDialog`. Those have no synchronous browser equivalent, so the host
 * bridge calls into a promise-based `DialogApi` that the React shell implements
 * with accessible in-app modals (see `src/app/DialogHost.tsx`).
 *
 * Declaring the interface here keeps the host layer free of React imports and
 * makes every dialog path unit-testable with a stub implementation.
 */

export interface PromptOptions {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Optional helper text rendered under the field. */
  hint?: string;
}

export interface ChooseOptions {
  title: string;
  options: string[];
  /** Optional descriptions aligned with `options` by index. */
  descriptions?: string[];
}

export interface DialogApi {
  /** Single-line text prompt. Resolves `null` when cancelled. */
  prompt(options: PromptOptions): Promise<string | null>;

  /** Choose one of `options`. Resolves the chosen index, or `null`. */
  choose(options: ChooseOptions): Promise<number | null>;

  /** Ask where a batch of screenshots should go. Resolves a label or `null`. */
  chooseScreenshotTarget(options: { suggestedFolder: string; count: number }): Promise<string | null>;

  /**
   * Offer the browser's directory picker. Resolves true when a real directory
   * handle was obtained, false when the user declined or it is unsupported.
   */
  requestDirectory(): Promise<boolean>;

  /** Confirmation dialog. */
  confirm(options: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean>;
}

/** A stub used by tests and by the headless host: everything is declined. */
export const nullDialogApi: DialogApi = {
  async prompt() {
    return null;
  },
  async choose() {
    return null;
  },
  async chooseScreenshotTarget() {
    return null;
  },
  async requestDirectory() {
    return false;
  },
  async confirm() {
    return false;
  },
};

/**
 * A headless implementation useful for scripted runs: prompts resolve to the
 * supplied map, chooses to the first option, confirms always true.
 */
export function scriptedDialogApi(answers: Record<string, string> = {}): DialogApi {
  return {
    async prompt(options) {
      return answers[options.title] ?? options.value ?? null;
    },
    async choose(options) {
      return options.options.length ? 0 : null;
    },
    async chooseScreenshotTarget({ suggestedFolder }) {
      return suggestedFolder;
    },
    async requestDirectory() {
      return false;
    },
    async confirm() {
      return true;
    },
  };
}
