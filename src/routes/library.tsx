import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { useRef } from 'react';
import { LibraryScreen } from '../components/screens/LibraryScreen'
import { useNotesStore } from '../stores/notesStore';
import { audioStorage } from '../utils/audioStorage';
import { toast } from '@/hooks/use-toast';

function LibraryRoute() {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const { createNote, updateNote } = useNotesStore();

  const handleUploadAudio = () => {
    audioInputRef.current?.click();
  };

  const handleUploadMarkdown = () => {
    markdownInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'markdown') => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (type === 'audio') {
        // Validate audio file
        const validAudioTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/m4a'];
        const validExtensions = ['.mp3', '.wav', '.webm', '.m4a'];
        
        const isValidType = validAudioTypes.includes(file.type) || 
                           validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        
        if (!isValidType) {
          toast({
            title: 'Invalid File Type',
            description: 'Please select an audio file (MP3, WAV, WebM, or M4A)',
            variant: 'destructive'
          });
          return;
        }

        // Create note and attach audio
        const noteId = createNote();
        const note = useNotesStore.getState().getNoteById(noteId);
        
        if (note) {
          const storageId = `recording_${noteId}_${Date.now()}`;
          const mimeType = file.type || 'audio/webm';
          const audioUrl = await audioStorage.saveAudio(file, storageId, mimeType);
          
          const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
          updateNote({
            ...note,
            title: fileNameWithoutExt,
            audioUrl,
            lastEdited: Date.now()
          });
          
          toast({
            title: 'Audio Uploaded',
            description: `"${file.name}" has been uploaded to a new note.`,
          });
        }
      } else if (type === 'markdown') {
        // Validate markdown file
        const validMarkdownTypes = ['text/markdown', 'text/plain'];
        const validExtensions = ['.md', '.markdown', '.txt'];
        
        const isValidType = validMarkdownTypes.includes(file.type) || 
                           validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        
        if (!isValidType) {
          toast({
            title: 'Invalid File Type',
            description: 'Please select a markdown or text file (.md, .markdown, .txt)',
            variant: 'destructive'
          });
          return;
        }

        // Create note and add content
        const text = await file.text();
        const noteId = createNote();
        const note = useNotesStore.getState().getNoteById(noteId);
        
        if (note) {
          const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
          updateNote({
            ...note,
            title: fileNameWithoutExt,
            content: text,
            lastEdited: Date.now()
          });
          
          toast({
            title: 'Markdown Uploaded',
            description: `"${file.name}" has been imported as a new note.`,
          });
        }
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Upload Failed',
        description: 'There was an error uploading your file. Please try again.',
        variant: 'destructive'
      });
    }

    // Reset the file input
    event.target.value = '';
  };

  return (
    <>
      <LibraryScreen 
        onUploadAudio={handleUploadAudio}
        onUploadMarkdown={handleUploadMarkdown}
      />
      
      {/* Hidden file inputs */}
      <input
        ref={audioInputRef}
        type="file"
        accept=".mp3,.wav,.webm,.m4a,audio/mp3,audio/mpeg,audio/wav,audio/webm,audio/mp4"
        onChange={(e) => handleFileSelect(e, 'audio')}
        className="hidden"
      />
      <input
        ref={markdownInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={(e) => handleFileSelect(e, 'markdown')}
        className="hidden"
      />
    </>
  );
}

export const Route = createFileRoute('/library')({
  validateSearch: z.object({
    q: z.string().optional(),
  }),
  component: LibraryRoute,
});
