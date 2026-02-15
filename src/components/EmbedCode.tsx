import { Card } from './ui/card';
import type { FormQuestion, VCThesis } from './FormBuilder';
import { Globe, ExternalLink, Code, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { publishForm } from '../utils/api';
import type { User } from '@supabase/supabase-js';

interface EmbedCodeProps {
  formName: string;
  questions: FormQuestion[];
  thesis: VCThesis;
  onPublish: (
    formId: string,
    formName: string,
    questions: FormQuestion[],
    thesis: VCThesis
  ) => void;
  isPublicView?: boolean;
  authState?: {
    isAuthenticated: boolean;
    accessToken: string | null;
    user: User | null;
  };
  publishedFormId?: string | null;
  handlePublishSuccess?: (formId: string) => void;
  handleUnpublish?: () => void;
  isPublished?: boolean;
  hasUnsavedChanges?: boolean;
}

export function EmbedCode({
  formName,
  questions,
  thesis,
  onPublish,
  isPublicView = false,
  authState,
  publishedFormId: publishedFormIdProp = null,
  handlePublishSuccess,
  handleUnpublish,
  isPublished: isPublishedProp = false,
  hasUnsavedChanges = false,
}: EmbedCodeProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  const formId = publishedFormIdProp;
  const isPublished = isPublishedProp;

  // -----------------------------------
  // Publish / Update
  // -----------------------------------
  const handlePublishToggle = async (checked: boolean) => {
    if (isPublicView) return;

    if (!checked) {
      handleUnpublish?.();
      toast('Form set to draft');
      return;
    }

    // 🔐 REQUIRE AUTH TOKEN
    if (!authState?.accessToken) {
      toast.error("You must be logged in to publish");
      return;
    }

    setIsPublishing(true);

    try {
      const result = await publishForm({
        oldFormId: formId || undefined,
        formName,
        questions,
        thesis,
        accessToken: authState.accessToken,
      });

      if (!result.success || !result.formId) {
        toast.error(result.error || 'Failed to publish form');
        setIsPublishing(false);
        return;
      }

      handlePublishSuccess?.(result.formId);
      onPublish(result.formId, formName, questions, thesis);

      if (hasUnsavedChanges) {
        toast.success('Form updated and published successfully');
      } else {
        toast.success('Form published successfully');
      }
    } catch (err) {
      console.error('[PUBLISH ERROR]', err);
      toast.error('Failed to publish form');
    } finally {
      setIsPublishing(false);
    }
  };

  // -----------------------------------
  // FIGMA-SAFE QUERY LINK
  // -----------------------------------
  const publicUrl = formId
    ? `${window.location.origin}?form=${formId}`
    : '';

  const iframeCode = publicUrl
    ? `<iframe
  src="${publicUrl}"
  width="100%"
  height="800"
  style="border:none;border-radius:8px;"
  loading="lazy"
></iframe>`
    : '';

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Copied to clipboard');
  };

  return (
    <Card className="p-6 space-y-6">
      {/* Publish */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="flex items-center gap-2">
            <Globe className="size-4" />
            Publish Form
          </h2>
          <p className="text-sm text-muted-foreground">
            Publish once and keep the same public link forever
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Label>{isPublished ? 'Published' : 'Draft'}</Label>
          <Switch
            checked={isPublished}
            onCheckedChange={handlePublishToggle}
            disabled={isPublishing || isPublicView}
          />
        </div>
      </div>

      {isPublished && formId && (
        <>
          {/* Public Link */}
          <div className="space-y-2">
            <Label>Public Form URL</Label>
            <div className="p-3 border rounded font-mono text-sm break-all">
              {publicUrl}
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary underline"
            >
              <ExternalLink className="size-4" />
              Open form
            </a>
          </div>

          {/* Embed */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Code className="size-4" />
              <Label>Embed HTML</Label>
            </div>

            <pre className="relative bg-muted p-4 rounded text-sm overflow-x-auto">
              <code>{iframeCode}</code>

              <button
                onClick={() => copy(iframeCode)}
                className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
              >
                {copied ? (
                  <span className="flex items-center gap-1">
                    <Check className="size-3" /> Copied
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Copy className="size-3" /> Copy
                  </span>
                )}
              </button>
            </pre>
          </div>
        </>
      )}

      {!isPublished && hasUnsavedChanges && formId && (
        <p className="text-sm text-muted-foreground">
          Changes detected. Toggle to <span className="font-medium">Published</span> to update the same public link.
        </p>
      )}
    </Card>
  );
}
