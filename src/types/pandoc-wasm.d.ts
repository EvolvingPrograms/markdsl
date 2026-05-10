// Ambient declaration for the optional `pandoc-wasm` peer dep. The
// upstream package ships no .d.ts; we hand-roll the surface we use
// (just the `convert` function). If pandoc-wasm ever publishes
// official types, drop this file.

declare module 'pandoc-wasm' {
  export interface PandocOptions {
    from?: string;
    to?: string;
    standalone?: boolean;
    'output-file'?: string;
    'extract-media'?: string;
    'table-of-contents'?: boolean;
    [key: string]: unknown;
  }

  export interface PandocConvertResult {
    stdout: string;
    stderr: string;
    warnings: unknown[];
    files: Record<string, string | Blob>;
    mediaFiles: Record<string, Blob>;
  }

  export function convert(
    options: PandocOptions,
    stdin?: string,
    files?: Record<string, string | Blob>,
  ): Promise<PandocConvertResult>;
}
