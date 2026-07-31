declare module 'pdf-parse' {
  function pdf(data: Buffer): Promise<{
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
  }>;
  export = pdf;
}
