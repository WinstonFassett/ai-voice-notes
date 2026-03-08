import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from '@tanstack/react-router';
import { Route } from '../../routes/library';
import { formatDistanceToNow } from 'date-fns';

// Import existing stores
import { useNotesStore, Note } from '../../stores/notesStore';
import { useRecordingStore } from '../../stores/recordingStore';
import { useAudioStore } from '../../stores/audioStore';

// Import redesigned UI components
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Plus, Search, Play, Pause, Trash2, Bot, FileText } from 'lucide-react';
import { AppHeader } from '../Layout/AppHeader';
import { AddButton } from '../AddButton';
import { cn } from '../../lib/utils';
import { MarkdownPreview } from '../MarkdownPreview';

interface LibraryScreenProps {
  onUploadAudio: () => void;
  onUploadMarkdown: () => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ onUploadAudio, onUploadMarkdown }) => {
  // Get everything from stores
  const { notes, deleteNote, createNote } = useNotesStore();
  const { startRecordingFlow } = useRecordingStore();
  const { playAudio, togglePlayPause, currentPlayingAudioUrl, globalIsPlaying } = useAudioStore();
  const navigate = useNavigate({ from: Route.id });
  const { q: searchInput = '' } = Route.useSearch();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSearch = e.target.value;
    navigate({ search: (prev) => ({ ...prev, q: newSearch || undefined }), replace: true });
  };

  // Filter notes to only show top-level notes (no parent)
  const topLevelNotes = useMemo(() => {
    return notes.filter(note => !note.sourceNoteIds || note.sourceNoteIds.length === 0);
  }, [notes]);

  // Build matching helpers for search
  const terms = useMemo(() => searchInput.toLowerCase().split(/\s+/).filter(Boolean), [searchInput]);

  const matches = useCallback((note: Note) => {
    if (!searchInput) return false;
    const haystack = [
      note.title || '',
      note.content || '',
      ...(note.tags || []),
      note.agentId || ''
    ].join(' ').toLowerCase();
    return terms.every(t => haystack.includes(t));
  }, [searchInput, terms]);

  const hasMatchInSubtree = useCallback(function hasMatchInSubtreeLocal(note: Note): boolean {
    if (!searchInput) return true;
    if (matches(note)) return true;
    const children = getChildNotes(note.id);
    for (const child of children) {
      if (hasMatchInSubtreeLocal(child)) return true;
    }
    return false;
  }, [searchInput, matches, notes]);

  // Apply search filter
  const filteredNotes = useMemo(() => {
    // When empty, show top-level only
    if (!searchInput) return topLevelNotes;

    // Show only top-level notes whose subtree matches
    return topLevelNotes.filter(n => hasMatchInSubtree(n));
  }, [topLevelNotes, searchInput, hasMatchInSubtree]);

  // Group notes by date
  const groupedNotes = useMemo(() => {
    const groups: { [key: string]: Note[] } = {};
    const now = new Date();

    filteredNotes.forEach(note => {
      if (!note) return;
      const noteDate = new Date(note.lastEdited);
      const diffInDays = Math.floor((now.getTime() - noteDate.getTime()) / (1000 * 60 * 60 * 24));

      let groupKey: string;
      if (diffInDays === 0) {
        groupKey = 'Today';
      } else if (diffInDays === 1) {
        groupKey = 'Yesterday';
      } else if (diffInDays < 7) {
        groupKey = 'This Week';
      } else if (diffInDays < 30) {
        groupKey = 'This Month';
      } else {
        groupKey = 'Older';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(note);
    });

    return groups;
  }, [filteredNotes]);

  // Helper function to get a plain text preview of content for cards
  const getContentPreview = (content: string, maxLength: number = 120) => {
    if (!content) return '';

    // Get first paragraph and truncate if needed
    const firstParagraph = content.split('\n')[0];
    return firstParagraph.length > maxLength ? firstParagraph.slice(0, maxLength) + '...' : firstParagraph;
  };

  // Get child notes for a given parent note
  function getChildNotes(parentId: string): Note[] {
    if (!parentId) return [];
    return notes.filter(note =>
      note && note.sourceNoteIds && note.sourceNoteIds.includes(parentId)
    ).sort((a, b) => b.lastEdited - a.lastEdited);
  }

  // Recursive function to render a note with its children
  const renderNoteWithChildren = (note: Note, level: number = 0) => {
    if (!note) return null;
    const isSearching = !!searchInput;
    const isMatch = matches(note);
    const formattedDate = formatDistanceToNow(new Date(note.lastEdited), { addSuffix: true });
    const childNotes = getChildNotes(note.id);
    const visibleChildren = isSearching ? childNotes.filter(c => hasMatchInSubtree(c)) : childNotes;
    const isAgentNote = note.type === 'agent';
    const hasAudio = note.audioUrl !== null && note.audioUrl !== undefined;
    const formattedDuration = note.duration ?
      `${Math.floor(note.duration / 60)}:${(note.duration % 60).toString().padStart(2, '0')}` :
      null;

    const handleNoteClick = (note: Note) => {
      navigate({ to: `/note/${note.id}` });
    };

    return (
      <div key={note.id} className={level === 0 ? 'mb-2' : 'mt-2'}>
        <Card
          className={cn(
            'transition-all duration-200',
            isAgentNote && 'border-l-4 border-l-primary',
            isSearching && !isMatch ? 'opacity-80 bg-accent/30 hover:bg-accent/40 cursor-default' : 'cursor-pointer hover:bg-accent/50'
          )}
          onClick={() => {
            if (!isSearching || isMatch) navigate({ to: '/note/$id', params: { id: note.id } });
          }}
          style={{ marginLeft: `${level * 16}px` }}
        >
          <CardContent className={cn('p-4', isSearching && !isMatch && 'py-2')}>
            <div className="flex items-start gap-3">
              {/* Left column for play button or icon */}
              <div className="flex-shrink-0">
                {hasAudio && (!isSearching || isMatch) ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (note.audioUrl) {
                        if (currentPlayingAudioUrl === note.audioUrl && globalIsPlaying) {
                          togglePlayPause();
                        } else {
                          playAudio(note.audioUrl);
                        }
                      }
                    }}
                    className="h-12 w-12 rounded-full"
                  >
                    {currentPlayingAudioUrl === note.audioUrl && globalIsPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                  </Button>
                ) : (
                  <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center">
                    {isAgentNote ? (
                      <Bot className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                {/* Title row with delete button */}
                <div className="flex items-start justify-between mb-1 relative">
                  <h3 className="font-medium pr-8 line-clamp-2">
                    {note.title || 'Untitled Note'}
                    {isSearching && !isMatch && (
                      <span className="ml-2 text-xs text-muted-foreground">(contains matches)</span>
                    )}
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteToDelete(note);
                      setShowDeleteConfirm(true);
                    }}
                    className="h-6 w-6 p-0 absolute top-0 right-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Content preview */}
                {(!isSearching || isMatch) && note.content && (
                  <MarkdownPreview content={(note.content)} className="text-sm text-muted-foreground mb-2 line-clamp-2" />
                )}

                {/* Info row - date, duration, child count */}
                {(!isSearching || isMatch) && (
                  <div className="flex items-center text-xs text-muted-foreground mb-2">
                    <span>{formattedDate}</span>
                    {formattedDuration && (
                      <>
                        <span className="mx-1">•</span>
                        <span>{formattedDuration}</span>
                      </>
                    )}
                    {visibleChildren.length > 0 && (
                      <>
                        <span className="mx-1">•</span>
                        <span>{visibleChildren.length} child note{visibleChildren.length !== 1 ? 's' : ''}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Tags row - always at the bottom */}
                {(!isSearching || isMatch) && note.tags && note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {note.tags.map(tag => (
                      <span
                        key={tag}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ search: { q: tag } });
                        }}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs 
                                 bg-primary/20 text-primary border border-primary/30 
                                 cursor-pointer hover:bg-primary/30"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Render child notes - only matching children while searching */}
        {visibleChildren.length > 0 && visibleChildren.map(childNote => renderNoteWithChildren(childNote, level + 1))}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto">
      {/* Header with AppHeader component */}
      <AppHeader
        title="Library"
        actions={
          <AddButton
            onStartRecording={startRecordingFlow}
            onUploadAudio={onUploadAudio}
            onUploadMarkdown={onUploadMarkdown}
            onCreateNote={() => {
              const newNoteId = createNote();
              navigate({ to: '/note/$id', params: { id: newNoteId } });
            }}
          />
        }
      />

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search notes..."
              className="w-full pl-10"
              value={searchInput}
              onChange={handleSearchChange}
            />
          </div>

          {/* Notes List */}
          <div className="space-y-6">
            {Object.keys(groupedNotes).length > 0 ? (
              Object.entries(groupedNotes).map(([groupName, groupNotes]) => (
                <div key={groupName} className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    {groupName}
                  </h2>
                  <div className="space-y-3">
                    {groupNotes.map(note => renderNoteWithChildren(note))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <div className="text-muted-foreground mb-4">
                  {searchInput ? 'No notes match your search' : 'No notes yet'}
                </div>
                {!searchInput && (
                  <Button onClick={() => startRecordingFlow()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create your first note
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && noteToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-background rounded-xl p-6 max-w-md w-full border border-border"
            >
              <h3 className="text-lg font-semibold mb-4">Delete Note</h3>
              <p className="mb-2">
                Are you sure you want to delete "{noteToDelete.title}"?
              </p>
              <p className="text-muted-foreground text-sm mb-6">
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setNoteToDelete(null);
                    setShowDeleteConfirm(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteNote(noteToDelete.id);
                    setNoteToDelete(null);
                    setShowDeleteConfirm(false);
                  }}
                >
                  Delete Note
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};