export interface Storage {
  listPages(): Promise<string[]>;
  readPage(path: string): Promise<string>;
  writePage(path: string, html: string): Promise<string>;
  deletePage(path: string): Promise<void>;
}
