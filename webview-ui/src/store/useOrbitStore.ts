import { create } from 'zustand';
import { Message, DiffProposal, Attachment } from '../types';
import { ChatSessionMetadata } from '../components/ChatHistory';

interface OrbitState {
  view: 'chat' | 'diff' | 'history' | 'chatHistory';
  proposal: DiffProposal | null;
  decisions: any[];
  messages: Message[];
  chatHistory: ChatSessionMetadata[];
  isGenerating: boolean;
  models: string[];
  currentModel: string;
  selectedImage: string | null;
  attachments: Attachment[];
  statusMessage: string;
  connectionState: 'Connected' | 'Disconnected' | 'Checking...';
  hasAttemptedInitialHistoryLoad: boolean;
  telemetry: { durationMs: number; tps: string; iteration: number } | null;
  
  // Actions
  setView: (view: 'chat' | 'diff' | 'history' | 'chatHistory') => void;
  setProposal: (proposal: DiffProposal | null) => void;
  setDecisions: (decisions: any[]) => void;
  appendDecisions: (newDecisions: any[]) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  addMessage: (message: Message) => void;
  appendAIResponseChunk: (chunk: string) => void;
  startAIResponse: () => void;
  setAIResponse: (content: string) => void;
  setChatHistory: (history: ChatSessionMetadata[]) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setModels: (models: string[]) => void;
  setCurrentModel: (model: string) => void;
  setSelectedImage: (image: string | null) => void;
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (path: string) => void;
  clearAttachments: () => void;
  setStatusMessage: (message: string) => void;
  setConnectionState: (state: 'Connected' | 'Disconnected' | 'Checking...') => void;
  setHasAttemptedInitialHistoryLoad: (hasAttempted: boolean) => void;
  setTelemetry: (telemetry: { durationMs: number; tps: string; iteration: number } | null) => void;
  clearChat: () => void;
}

export const useOrbitStore = create<OrbitState>((set) => ({
  view: window.initialData ? 'diff' : 'chat',
  proposal: window.initialData || null,
  decisions: [],
  messages: [],
  chatHistory: [],
  isGenerating: false,
  models: [],
  currentModel: '',
  selectedImage: null,
  attachments: [],
  statusMessage: '',
  connectionState: 'Checking...',
  hasAttemptedInitialHistoryLoad: false,
  telemetry: null,

  setView: (view) => set({ view }),
  setProposal: (proposal) => set({ proposal }),
  setDecisions: (decisions) => set({ decisions }),
  appendDecisions: (newDecisions) => set((state) => ({ decisions: [...state.decisions, ...newDecisions] })),
  setMessages: (messages) => set((state) => ({
    messages: typeof messages === 'function' ? messages(state.messages) : messages
  })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  appendAIResponseChunk: (chunk) => set((state) => {
    const prev = state.messages;
    const last = prev[prev.length - 1];
    if (last && last.role === 'ai') {
        return { messages: [...prev.slice(0, -1), { ...last, content: last.content + chunk }] };
    } else {
        return { messages: [...prev, { role: 'ai', content: chunk }] };
    }
  }),
  startAIResponse: () => set((state) => {
    const last = state.messages[state.messages.length - 1];
    // Reuse an empty assistant turn instead of stacking blank ones.
    if (last && last.role === 'ai' && last.content === '') {
      return { isGenerating: true };
    }
    return { messages: [...state.messages, { role: 'ai', content: '' }], isGenerating: true };
  }),
  setAIResponse: (content) => set((state) => {
    const prev = state.messages;
    const last = prev[prev.length - 1];
    if (last && last.role === 'ai') {
      return { messages: [...prev.slice(0, -1), { ...last, content }] };
    }
    return { messages: [...prev, { role: 'ai', content }] };
  }),
  setChatHistory: (chatHistory) => set({ chatHistory }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setModels: (models) => set({ models }),
  setCurrentModel: (currentModel) => set({ currentModel }),
  setSelectedImage: (selectedImage) => set({ selectedImage }),
  addAttachment: (attachment) => set((state) => ({
    attachments: state.attachments.some(a => a.path === attachment.path)
      ? state.attachments
      : [...state.attachments, attachment]
  })),
  removeAttachment: (path) => set((state) => ({ attachments: state.attachments.filter(a => a.path !== path) })),
  clearAttachments: () => set({ attachments: [] }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setHasAttemptedInitialHistoryLoad: (hasAttemptedInitialHistoryLoad) => set({ hasAttemptedInitialHistoryLoad }),
  setTelemetry: (telemetry) => set({ telemetry }),
  clearChat: () => set({
    messages: [],
    isGenerating: false,
    selectedImage: null,
    attachments: [],
    statusMessage: '',
    view: 'chat',
    telemetry: null
  })
}));
