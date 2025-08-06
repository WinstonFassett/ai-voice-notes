import { create } from 'zustand';
import { useSettingsStore } from './settingsStore';
import { useNotesStore } from './notesStore';
import { useAgentsStore } from './agentsStore';
import { useLLMProvidersStore } from './llmProvidersStore';
import { generateSmartTitle } from '../utils/titleGenerator';
import { audioStorage, isStorageUrl, resolveStorageUrl } from '../utils/audioStorage';

export interface ProgressItem {
  file: string;
  loaded?: number;
  progress: number;
  total?: number;
  name?: string;
  status: string;
}

interface TranscriptionState {
  // Worker state
  worker: Worker | null;
  isInitialized: boolean;
  
  // Current transcription
  currentNoteId: string | null;
  lastTranscription: string | null;
  processingNotes: Map<string, { 
    isProcessing: boolean; 
    status: string;
    progressItems: ProgressItem[];
  }>;
  
  // Actions
  initializeWorker: () => void;
  initializeWorkerAsync: () => Promise<void>;
  startTranscription: (audioData: AudioBuffer, noteId: string) => void;
  startTranscriptionLocal: (audioData: AudioBuffer, noteId: string) => void;
  startTranscriptionFromUrl: (audioUrl: string, noteId: string) => Promise<void>;
  cleanup: () => void;
  
  // Status getters
  isNoteProcessing: (noteId: string) => boolean;
  getNoteProcessingStatus: (noteId: string) => string;
  getNoteProgressItems: (noteId: string) => ProgressItem[];
  
  // Internal handlers
  handleWorkerMessage: (event: MessageEvent) => void;
  updateTranscription: (text: string) => void;
  completeTranscription: (text: string) => void;
}

async function transcribeWithOpenAI(audioData: AudioBuffer, noteId: string, set: any, get: any) {
  set((state: any) => ({
    processingNotes: new Map(state.processingNotes).set(noteId, {
      isProcessing: true,
      status: 'Uploading audio to OpenAI...'
    }),
    currentNoteId: noteId
  }));

  try {
    // Convert AudioBuffer to WAV Blob using robust utility
    const wavBlob = await audioStorage.audioBufferToWAV(audioData);
    // Get OpenAI API key from provider
    const providers = useLLMProvidersStore.getState().getValidProviders();
    const openai = providers.find(p => p.name.toLowerCase() === 'openai');
    if (!openai || !openai.apiKey) throw new Error('No OpenAI API key configured');

    // Prepare form data
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('model', 'whisper-1');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openai.apiKey}`
      },
      body: formData
    });
    if (!response.ok) throw new Error('OpenAI transcription failed');
    const result = await response.json();
    const text = result.text || '';

    // Complete transcription
    get().completeTranscription(text);
  } catch (error: any) {
    set((state: any) => ({
      processingNotes: new Map(state.processingNotes).set(noteId, {
        isProcessing: false,
        status: `OpenAI failed: ${error.message || error}`
      }),
      currentNoteId: null
    }));
    // Fallback to local model
    get().startTranscriptionLocal(audioData, noteId);
  }
}

export const useTranscriptionStore = create<TranscriptionState>((set, get) => ({
  worker: null,
  isInitialized: false,
  currentNoteId: null,
  lastTranscription: null,
  processingNotes: new Map(),
  
  initializeWorker: () => {
    const state = get();
    if (state.worker) return;

    console.log('🎯 TranscriptionStore: Initializing worker');
    
    try {
      const worker = new Worker(new URL("../worker.js", import.meta.url), {
        type: "module",
      });

      worker.addEventListener("message", get().handleWorkerMessage);
      
      set({ 
        worker, 
        isInitialized: true 
      });
      
      console.log('🎯 TranscriptionStore: Worker initialized successfully');
    } catch (error) {
      console.error('❌ TranscriptionStore: Failed to initialize worker:', error);
      set({ isInitialized: false });
    }
  },
  
  // Async version of initializeWorker that returns a promise
  initializeWorkerAsync: async () => {
    return new Promise<void>((resolve, reject) => {
      const state = get();
      if (state.worker && state.isInitialized) {
        resolve();
        return;
      }

      console.log('🎯 TranscriptionStore: Initializing worker asynchronously');
      
      try {
        const worker = new Worker(new URL("../worker.js", import.meta.url), {
          type: "module",
        });

        // Set up message handler
        worker.addEventListener("message", get().handleWorkerMessage);
        
        // Set up error handler
        worker.addEventListener("error", (event) => {
          console.error('❌ TranscriptionStore: Worker error:', event);
          reject(new Error(`Worker error: ${event.message}`));
        });
        
        set({ 
          worker, 
          isInitialized: true 
        });
        
        console.log('🎯 TranscriptionStore: Worker initialized successfully');
        resolve();
      } catch (error) {
        console.error('❌ TranscriptionStore: Failed to initialize worker:', error);
        set({ isInitialized: false });
        reject(error);
      }
    });
  },
  
  isNoteProcessing: (noteId: string) => {
    const state = get();
    return state.processingNotes.get(noteId)?.isProcessing || false;
  },
  
  getNoteProcessingStatus: (noteId: string) => {
    const state = get();
    return state.processingNotes.get(noteId)?.status || '';
  },

  getNoteProgressItems: (noteId: string) => {
    const state = get();
    return state.processingNotes.get(noteId)?.progressItems || [];
  },
  
  handleWorkerMessage: (event: MessageEvent) => {
    const message = event.data;
    const state = get();
    const noteId = state.currentNoteId;
    
    if (!noteId) return;

    switch (message.status) {
      case "initiate":
        set((state) => {
          const existing = state.processingNotes.get(noteId)?.progressItems || [];
          return {
            processingNotes: new Map(state.processingNotes).set(noteId, {
              isProcessing: true,
              status: 'Loading model files...',
              progressItems: [
                ...existing.filter(item => item.file !== message.file),
                {
                  file: message.file,
                  progress: 0,
                  status: 'Starting...'
                }
              ]
            })
          };
        });
        break;
        
      case "progress":
        set((state) => {
          const existing = state.processingNotes.get(noteId)?.progressItems || [];
          return {
            processingNotes: new Map(state.processingNotes).set(noteId, {
              isProcessing: true,
              status: 'Loading model files...',
              progressItems: existing.map(item => 
                item.file === message.file 
                  ? { ...item, progress: Math.round(message.progress) }
                  : item
              )
            })
          };
        });
        break;
        
      case "ready":
        set((state) => ({
          processingNotes: new Map(state.processingNotes).set(noteId, {
            isProcessing: true,
            status: 'Model loaded, starting transcription...',
            progressItems: state.processingNotes.get(noteId)?.progressItems.map(item => ({
              ...item,
              progress: 100,
              status: 'Complete'
            })) || []
          })
        }));
        break;
        
      case "update":
        set((state) => ({
          processingNotes: new Map(state.processingNotes).set(noteId, {
            isProcessing: true,
            status: 'Transcribing...',
            progressItems: state.processingNotes.get(noteId)?.progressItems || []
          })
        }));
        if (message.data && message.data[0]) {
          get().updateTranscription(message.data[0]);
        }
        break;

      case "complete":
        if (message.data && message.data.text) {
          get().completeTranscription(message.data.text);
        }
        break;

      case "error":
        console.error('❌ TranscriptionStore: Worker error:', message.data);
        set((state) => ({
          processingNotes: new Map(state.processingNotes).set(noteId, {
            isProcessing: false,
            status: 'Transcription failed',
            progressItems: []
          }),
          currentNoteId: null
        }));
        break;
    }
  },
  
  startTranscriptionFromUrl: async (audioUrl: string, noteId: string) => {
    console.log('🎯 TranscriptionStore: Starting transcription from URL:', audioUrl);
    
    set((state) => ({
      processingNotes: new Map(state.processingNotes).set(noteId, {
        isProcessing: true,
        status: 'Loading audio...',
        progressItems: []
      }),
      currentNoteId: noteId
    }));
    
    try {
      // Resolve storage URL if needed
      let resolvedUrl = audioUrl;
      if (isStorageUrl(audioUrl)) {
        const resolved = await resolveStorageUrl(audioUrl);
        if (!resolved) {
          throw new Error('Failed to resolve audio URL');
        }
        resolvedUrl = resolved.url;
      }
      
      // Fetch and decode audio
      const response = await fetch(resolvedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }
      
      const audioBlob = await response.blob();
      const audioBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioData = await audioContext.decodeAudioData(audioBuffer);
      
      // Start transcription
      get().startTranscription(audioData, noteId);
      
    } catch (error) {
      console.error('❌ TranscriptionStore: Failed to start transcription from URL:', error);
      set((state) => ({
        processingNotes: new Map(state.processingNotes).set(noteId, {
          isProcessing: false,
          status: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          progressItems: []
        }),
        currentNoteId: null
      }));
    }
  },
  
  startTranscription: (audioData: AudioBuffer, noteId: string) => {
    const settings = useSettingsStore.getState();
    const providers = useLLMProvidersStore.getState().getValidProviders();
    const hasOpenAI = settings.useOpenAIForSTT && providers.some(p => p.name.toLowerCase() === 'openai' && p.apiKey);
    if (hasOpenAI) {
      transcribeWithOpenAI(audioData, noteId, set, get);
      return;
    }
    // Fallback to local model
    get().startTranscriptionLocal(audioData, noteId);
  },
  
  startTranscriptionLocal: async (audioData: AudioBuffer, noteId: string) => {
    let state = get();
    
    // Ensure worker is initialized
    if (!state.worker || !state.isInitialized) {
      try {
        await get().initializeWorkerAsync();
        // Get fresh state after initialization
        state = get();
      } catch (error) {
        console.error('❌ TranscriptionStore: Failed to initialize worker:', error);
        const notes = new Map(state.processingNotes);
        notes.set(noteId, { 
          isProcessing: false, 
          status: 'Failed to initialize transcription worker', 
          progressItems: [] 
        });
        set({ processingNotes: notes });
        return;
      }
    }
    
    // Double-check that worker is available after initialization
    if (!state.worker) {
      console.error('❌ TranscriptionStore: Worker still not initialized after initialization attempt');
      const notes = new Map(state.processingNotes);
      notes.set(noteId, { 
        isProcessing: false, 
        status: 'Failed to initialize transcription worker', 
        progressItems: [] 
      });
      set({ processingNotes: notes });
      return;
    }

    console.log('🎯 TranscriptionStore: Starting transcription for note:', noteId);
    
    set({
      processingNotes: new Map(state.processingNotes).set(noteId, {
        isProcessing: true,
        status: 'Preparing transcription...',
        progressItems: []
      }),
      currentNoteId: noteId,
      lastTranscription: null
    });

    // Get settings
    const settings = useSettingsStore.getState();

    // Process audio
    let audio;
    if (audioData.numberOfChannels === 2) {
      const SCALING_FACTOR = Math.sqrt(2);
      let left = audioData.getChannelData(0);
      let right = audioData.getChannelData(1);

      audio = new Float32Array(left.length);
      for (let i = 0; i < audioData.length; ++i) {
        audio[i] = SCALING_FACTOR * (left[i] + right[i]) / 2;
      }
    } else {
      audio = audioData.getChannelData(0);
    }

    // Send to worker
    state.worker.postMessage({
      audio,
      model: settings.model,
      multilingual: settings.multilingual,
      quantized: settings.quantized,
      subtask: settings.multilingual ? settings.subtask : null,
      language: settings.multilingual && settings.language !== "auto" ? settings.language : null,
    });
  },
  
  updateTranscription: (text: string) => {
    const state = get();
    if (!state.currentNoteId || !text) return;

    // Update note content progressively - this works regardless of current UI state
    const notesStore = useNotesStore.getState();
    const note = notesStore.getNoteById(state.currentNoteId);
    
    if (note) {
      const updatedNote = {
        ...note,
        content: text,
        updatedAt: Date.now(),
        lastEdited: Date.now()
      };
      notesStore.updateNote(updatedNote);
    }
  },
  
  completeTranscription: (text: string) => {
    const state = get();
    if (!state.currentNoteId || !text || text === state.lastTranscription) return;

    console.log('✅ TranscriptionStore: Transcription complete');
    
    set({ lastTranscription: text });

    const notesStore = useNotesStore.getState();
    const note = notesStore.getNoteById(state.currentNoteId);

    if (note) {
    // Update note - this works regardless of current UI state
      const smartTitle = generateSmartTitle(text);
      const updatedNote = {
        ...note,
        title: smartTitle,
        content: text,
        updatedAt: Date.now(),
        lastEdited: Date.now()
      };

      notesStore.updateNote(updatedNote);

      // Run auto-agents if available - this also works regardless of UI state
      const agentsStore = useAgentsStore.getState();
      if (agentsStore.canRunAnyAgents()) {
        console.log('🤖 TranscriptionStore: Running auto-agents');
        agentsStore.processNoteWithAllAutoAgents(state.currentNoteId);
      }
    }

    // Clear processing state for this note
    set((state) => ({
      processingNotes: new Map(state.processingNotes).set(state.currentNoteId!, {
        isProcessing: false,
        status: 'Complete',
        progressItems: []
      }),
      currentNoteId: null
    }));
    
    // TODO: Show toast notification when we have toast system
    console.log('🎉 Transcription completed for note:', state.currentNoteId);
  },
  
  cleanup: () => {
    const state = get();
    if (state.worker) {
      state.worker.terminate();
    }
    
    set({
      worker: null,
      isInitialized: false,
      currentNoteId: null,
      lastTranscription: null,
      processingNotes: new Map()
    });
  }
}));