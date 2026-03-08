import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  XMarkIcon,
  SpeakerWaveIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { toast } from '@/hooks/use-toast';

interface FileUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFile: (file: File, type: 'audio' | 'markdown') => void;
}

export const FileUploadDialog: React.FC<FileUploadDialogProps> = ({
  isOpen,
  onClose,
  onUploadFile
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'markdown') => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (type === 'audio') {
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
    } else if (type === 'markdown') {
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
    }

    onUploadFile(file, type);
    onClose();
    
    // Reset the file input
    event.target.value = '';
  };

  const handleAudioUpload = () => {
    fileInputRef.current?.click();
  };

  const handleMarkdownUpload = () => {
    markdownInputRef.current?.click();
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/50 z-40"
            />
            
            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 flex items-center justify-center p-4 z-50"
            >
              <Card className="w-full max-w-md bg-background border border-border shadow-2xl">
                <CardContent className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">Upload File</h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onClose}
                      className="h-8 w-8"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* Upload Options */}
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground mb-4">
                      Choose what type of file you want to upload:
                    </div>

                    {/* Audio Upload */}
                    <Button
                      onClick={handleAudioUpload}
                      variant="outline"
                      className="w-full h-auto p-4 flex items-center gap-4 justify-start"
                    >
                      <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                        <SpeakerWaveIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Upload Audio File</div>
                        <div className="text-sm text-muted-foreground">
                          MP3, WAV, WebM, M4A • Creates note with audio
                        </div>
                      </div>
                    </Button>

                    {/* Markdown Upload */}
                    <Button
                      onClick={handleMarkdownUpload}
                      variant="outline"
                      className="w-full h-auto p-4 flex items-center gap-4 justify-start"
                    >
                      <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                        <DocumentTextIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">Upload Markdown File</div>
                        <div className="text-sm text-muted-foreground">
                          .md, .markdown, .txt • Creates note with content
                        </div>
                      </div>
                    </Button>
                  </div>

                  {/* Hidden file inputs */}
                  <input
                    ref={fileInputRef}
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
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
