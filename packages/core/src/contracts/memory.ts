/**
 * In-memory reference implementations of every port.
 *
 * Two uses:
 *  - **Tests** can run the core with no host at all, which is what keeps core
 *    tests meaningful and fast.
 *  - **Targets** can extend the classes rather than implement every method,
 *    overriding only what they genuinely change.
 */

import type {
  AssetsPort,
  ChooseRequest,
  ConfirmRequest,
  HostPorts,
  OpsPort,
  PromptRequest,
  SecretPort,
  StoragePort,
} from "./ports";

/** A `StoragePort` backed by a `Map`. */
export class MemoryStorage implements StoragePort {
  protected map = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.map.get(key) as T | undefined;
  }
  set<T>(key: string, value: T): void {
    this.map.set(key, value);
  }
  remove(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

/** A `SecretPort` backed by a `Map`. Explicitly not secure. */
export class MemorySecrets implements SecretPort {
  protected map = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.map.get(key);
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/** An `AssetsPort` with nothing in it; subclasses supply the contents. */
export class MemoryAssets implements AssetsPort {
  constructor(protected files: Record<string, string> = {}) {}

  async readText(path: string): Promise<string> {
    const value = this.files[path];
    if (value === undefined) throw new Error(`Asset not found: ${path}`);
    return value;
  }

  async readBytes(path: string): Promise<Uint8Array> {
    return new TextEncoder().encode(await this.readText(path));
  }
}

/**
 * An `OpsPort` that declines everything. Useful as a test base.
 *
 * Parameters are named rather than elided (`confirm(_request)`) so a subclass
 * can narrow or use them without a signature mismatch — an override must be
 * assignable to the base it replaces.
 */
export class NullOps implements OpsPort {
  async prompt(_request: PromptRequest): Promise<string | null> {
    return null;
  }
  async choose(_request: ChooseRequest): Promise<number | null> {
    return null;
  }
  async confirm(_request: ConfirmRequest): Promise<boolean> {
    return false;
  }
  notify(_message: string, _level?: "info" | "error" | "success"): void {
    /* discard */
  }
  openExternal(_url: string): void {
    /* discard */
  }
  async writeClipboard(_text: string): Promise<void> {
    /* discard */
  }
  async chooseExportTarget(_request: { suggestedFolder: string; count: number }): Promise<string | null> {
    return _request.suggestedFolder;
  }
}

/**
 * An `OpsPort` that answers from a script.
 *
 * Lets a test drive a full export or import flow — including the dialogs — with
 * no UI and no timing dependencies.
 */
export class ScriptedOps extends NullOps {
  /** Recorded calls, for assertions. */
  readonly calls: { method: string; request: unknown }[] = [];

  constructor(
    private answers: {
      prompt?: Record<string, string>;
      choose?: number;
      confirm?: boolean;
    } = {}
  ) {
    super();
  }

  override async prompt(request: PromptRequest): Promise<string | null> {
    this.calls.push({ method: "prompt", request });
    return this.answers.prompt?.[request.title] ?? request.value ?? null;
  }

  override async choose(request: ChooseRequest): Promise<number | null> {
    this.calls.push({ method: "choose", request });
    return this.answers.choose ?? 0;
  }

  override async confirm(request: ConfirmRequest): Promise<boolean> {
    this.calls.push({ method: "confirm", request });
    return this.answers.confirm ?? true;
  }

  override notify(message: string, level?: "info" | "error" | "success"): void {
    this.calls.push({ method: "notify", request: { message, level } });
  }
}

/** A complete in-memory `HostPorts`, for tests and headless runs. */
export function createMemoryHost(
  files: Record<string, string> = {},
  overrides: Partial<HostPorts> = {}
): HostPorts {
  return {
    kind: "node",
    storage: new MemoryStorage(),
    secrets: new MemorySecrets(),
    assets: new MemoryAssets(files),
    ops: new NullOps(),
    ...overrides,
  };
}
