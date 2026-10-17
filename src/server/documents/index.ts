import "server-only";
import { InMemoryDocumentStore, type DocumentStore } from "./store";

export type { DocumentStore, SourceDocument } from "./store";

// Survives Next dev hot reloads; one store per server process (per replica in Azure).
const globalForStore = globalThis as unknown as { __documentStore?: DocumentStore };

export const documentStore: DocumentStore = (globalForStore.__documentStore ??= new InMemoryDocumentStore());
