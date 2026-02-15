import { useState } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Upload, FileJson, CheckCircle2, AlertCircle } from 'lucide-react';
import type { FormQuestion } from './FormBuilder';

interface ImportJsonDialogProps {
  onImport: (questions: FormQuestion[]) => void;
}

interface ImportedQuestionInput {
  id?: string;
  type?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  allowMultiple?: boolean;
}

export function ImportJsonDialog({ onImport }: ImportJsonDialogProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<FormQuestion[] | null>(null);
  const [open, setOpen] = useState(false);

  const exampleJson = JSON.stringify({
    questions: [
      {
        id: '4',
        type: 'textarea',
        label: 'Describe your product',
        placeholder: 'Tell us about your product or service',
        required: true
      },
      {
        id: '5',
        type: 'select',
        label: 'Funding Stage',
        placeholder: 'Select stage',
        required: true,
        allowMultiple: false,
        options: ['Pre-seed', 'Seed', 'Series A', 'Series B']
      }
    ]
  }, null, 2);

  const validateAndParseJson = (jsonStr: string) => {
    try {
      const parsed: unknown = JSON.parse(jsonStr);

      if (!parsed || typeof parsed !== 'object' || !('questions' in parsed)) {
        throw new Error('JSON must contain a "questions" array');
      }

      const { questions: rawQuestions } = parsed as { questions?: unknown };

      if (!rawQuestions || !Array.isArray(rawQuestions)) {
        throw new Error('JSON must contain a "questions" array');
      }

      const questions: FormQuestion[] = rawQuestions.map((rawQuestion, idx: number) => {
        const q = rawQuestion as ImportedQuestionInput;

        if (!q.label) {
          throw new Error(`Question ${idx + 1} is missing a "label" field`);
        }

        const validTypes = ['text', 'textarea', 'email', 'url', 'number', 'select'];
        const type = q.type || 'text';

        if (!validTypes.includes(type)) {
          throw new Error(`Question ${idx + 1} has invalid type "${type}". Valid types: ${validTypes.join(', ')}`);
        }

        if (type === 'select' && (!q.options || !Array.isArray(q.options) || q.options.length === 0)) {
          throw new Error(`Question ${idx + 1} is type "select" but missing valid "options" array`);
        }

        return {
          id: q.id || `${Date.now()}_${idx}`,
          type: type as FormQuestion['type'],
          label: q.label,
          placeholder: q.placeholder || '',
          required: q.required === true,
          options: type === 'select' ? q.options : undefined,
          allowMultiple: type === 'select' ? q.allowMultiple === true : false,
          locked: false,
        };
      });

      return questions;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error('Invalid JSON format. Please check your syntax.');
      }
      throw err;
    }
  };

  const handleValidate = () => {
    setError('');
    setPreview(null);

    if (!jsonInput.trim()) {
      setError('Please paste your JSON data');
      return;
    }

    try {
      const questions = validateAndParseJson(jsonInput);
      setPreview(questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse JSON');
    }
  };

  const handleImport = () => {
    if (preview) {
      onImport(preview);
      setOpen(false);
      setJsonInput('');
      setPreview(null);
      setError('');
    }
  };

  const handleUseExample = () => {
    setJsonInput(exampleJson);
    setError('');
    setPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="size-4" />
          Import Form as JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="size-5 text-primary" />
            Import Form from JSON
          </DialogTitle>
          <DialogDescription>
            Paste your existing form data in JSON format. This will replace all current optional questions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Paste JSON Data</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUseExample}
                className="text-xs"
              >
                Use Example
              </Button>
            </div>
            <Textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={exampleJson}
              rows={12}
              className="font-mono text-sm"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertCircle className="size-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Import Error</p>
                <p className="text-sm text-destructive/80">{error}</p>
              </div>
            </div>
          )}

          {preview && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="size-5 text-primary" />
                <p className="font-medium">Preview: {preview.length} questions ready to import</p>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {preview.map((q, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm p-2 bg-background rounded border border-border">
                    <span className="text-muted-foreground font-mono">{idx + 1}.</span>
                    <div className="flex-1">
                      <p className="font-medium">{q.label}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span className="px-2 py-0.5 bg-muted rounded">{q.type}</span>
                        {q.required && <span className="text-destructive">Required</span>}
                        {q.options && <span>({q.options.length} options)</span>}
                        {q.allowMultiple && <span>Multi-select</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 bg-muted rounded-lg text-sm">
            <p className="font-medium mb-2">JSON Format Requirements:</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Must contain a <code className="text-foreground bg-background px-1 rounded">questions</code> array</li>
              <li>Each question needs: <code className="text-foreground bg-background px-1 rounded">label</code>, <code className="text-foreground bg-background px-1 rounded">type</code></li>
              <li>Valid types: text, textarea, email, url, number, select</li>
              <li>Select questions must include <code className="text-foreground bg-background px-1 rounded">options</code> array</li>
              <li>Optional fields: <code className="text-foreground bg-background px-1 rounded">placeholder</code>, <code className="text-foreground bg-background px-1 rounded">required</code>, <code className="text-foreground bg-background px-1 rounded">allowMultiple</code>, <code className="text-foreground bg-background px-1 rounded">id</code></li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {!preview ? (
            <Button onClick={handleValidate}>
              Validate JSON
            </Button>
          ) : (
            <Button onClick={handleImport} className="gap-2">
              <Upload className="size-4" />
              Import {preview.length} Questions
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
