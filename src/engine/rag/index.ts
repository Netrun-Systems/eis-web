// EIS RAG module — public API barrel
export { ragClient, EIS_COLLECTIONS } from './charlotte-client';
export type { RAGClient, RAGResult, ChunkMetadata, QueryOptions } from './charlotte-client';

export { npcMemorySystem, NPCMemorySystem } from './npc-memory';
export type { NPCMemory, NPCMemoryInput, RecallContext, MemoryCategory } from './npc-memory';

export { dialogueGenerator, DialogueGenerator, selectConversationPattern, setLLMProvider, loadConversationPatterns } from './dialogue-generator';
export type { DialogueLine, DialogueContext, ConversationPattern } from './dialogue-generator';

export { knowledgePropagation, KnowledgePropagationSystem, selectProtocol } from './knowledge-propagation';
export type { CommunicationProtocol, KnowledgeTransfer } from './knowledge-propagation';

export {
  onNPCInteraction,
  onNPCObservation,
  scheduleMemoryDecay,
  flushRAGQueue,
  getPendingQueueSize,
  loadCommunicationProtocols,
} from './simulation-hooks';
