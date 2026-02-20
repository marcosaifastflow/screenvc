import { useMemo, useState } from 'react';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Button } from './ui/button';
import type { FormQuestion, VCThesis } from './FormBuilder';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { submitForm, uploadSubmissionFile } from '../utils/api';

type FormValue = string | string[];

interface PublishedFormProps {
  formId: string;
  formName: string;
  questions: FormQuestion[];
  thesis: VCThesis;
  onBackToBuilder: () => void;
  isPublicView?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMBER_REGEX = /^-?\d*(\.\d*)?$/;

const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const getStringValue = (value: FormValue | undefined) => (typeof value === 'string' ? value : '');

export function PublishedForm({
  formId,
  formName,
  questions,
}: PublishedFormProps) {
  const [formData, setFormData] = useState<Record<string, FormValue>>({});
  const [fileData, setFileData] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const normalizedQuestions = useMemo(
    () =>
      questions.map((question) => ({
        ...question,
        options: question.type === 'select' ? (question.options ?? []).filter(Boolean) : undefined,
        allowMultiple: question.type === 'select' ? Boolean(question.allowMultiple) : false,
      })),
    [questions],
  );

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};

    normalizedQuestions.forEach((question) => {
      const rawValue = formData[question.id];
      const stringValue = getStringValue(rawValue).trim();
      const arrayValue = Array.isArray(rawValue) ? rawValue : [];

      if (question.type === 'file') {
        const file = fileData[question.id];
        if (question.required && !file) {
          nextErrors[question.id] = 'This field is required.';
          return;
        }
        if (file && file.size > 10 * 1024 * 1024) {
          nextErrors[question.id] = 'File must be under 10 MB.';
        }
        return;
      }

      if (question.required) {
        if (question.type === 'select' && question.allowMultiple) {
          if (arrayValue.length === 0) {
            nextErrors[question.id] = 'This field is required.';
            return;
          }
        } else if (!stringValue) {
          nextErrors[question.id] = 'This field is required.';
          return;
        }
      }

      if (!stringValue && arrayValue.length === 0) {
        return;
      }

      if (question.type === 'text' && stringValue.length > 300) {
        nextErrors[question.id] = 'Text responses cannot exceed 300 characters.';
      }

      if (question.type === 'email' && !EMAIL_REGEX.test(stringValue)) {
        nextErrors[question.id] = 'Please enter a valid email address.';
      }

      if (question.type === 'url' && !isValidUrl(stringValue)) {
        nextErrors[question.id] = 'Please enter a valid URL (http or https).';
      }

      if (question.type === 'number' && !NUMBER_REGEX.test(stringValue)) {
        nextErrors[question.id] = 'Please enter a valid number.';
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const setSingleValue = (questionId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [questionId]: value }));
    setErrors((prev) => ({ ...prev, [questionId]: '' }));
  };

  const toggleMultiSelectValue = (questionId: string, option: string) => {
    setFormData((prev) => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const exists = current.includes(option);
      const next = exists ? current.filter((item) => item !== option) : [...current, option];
      return { ...prev, [questionId]: next };
    });
    setErrors((prev) => ({ ...prev, [questionId]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the validation errors before submitting.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload files first
      const fileQuestions = normalizedQuestions.filter((q) => q.type === 'file');
      const fileUrls: Record<string, string> = {};

      if (fileQuestions.length > 0) {
        setIsUploading(true);
        for (const fq of fileQuestions) {
          const file = fileData[fq.id];
          if (!file) continue;

          const uploadResult = await uploadSubmissionFile(formId, file);
          if (!uploadResult.success) {
            toast.error(`Failed to upload ${file.name}: ${uploadResult.error}`);
            setIsUploading(false);
            setIsSubmitting(false);
            return;
          }
          fileUrls[fq.id] = uploadResult.url;
        }
        setIsUploading(false);
      }

      const payload: Record<string, FormValue> = {};
      normalizedQuestions.forEach((question) => {
        if (question.type === 'file') {
          const url = fileUrls[question.id];
          if (url) {
            payload[question.label] = url;
          }
          return;
        }

        const value = formData[question.id];
        if (Array.isArray(value)) {
          if (value.length > 0) {
            payload[question.label] = value;
          }
          return;
        }

        const trimmed = (value ?? '').trim();
        if (trimmed.length > 0) {
          payload[question.label] = trimmed;
        }
      });

      const result = await submitForm(formId, payload);

      if (!result.success) {
        toast.error(result.error || 'Failed to submit application');
        return;
      }

      toast.success('Application submitted successfully');
      setSubmitted(true);
    } catch (error) {
      console.error('[SUBMISSION ERROR]', error);
      toast.error('Failed to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center max-w-xl">
          <CheckCircle2 className="size-10 text-primary mx-auto mb-4" />
          <h1>Application Submitted</h1>
          <p className="text-muted-foreground mt-2">
            Thank you for your submission. We will review your application and get
            back to you soon.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 md:py-12 md:px-6">
      <div className="max-w-3xl mx-auto">
        <Card className="p-4 md:p-8">
          <div className="mb-6 border-b pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="size-5 text-primary" />
              <span className="font-semibold">ScreenVC</span>
            </div>
            <h1>{formName}</h1>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {normalizedQuestions.map((question) => {
              const error = errors[question.id];
              const value = formData[question.id];

              return (
                <div key={question.id}>
                  <Label>
                    {question.label}
                    {question.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>

                  {question.type === 'textarea' ? (
                    <Textarea
                      required={question.required}
                      placeholder={question.placeholder}
                      value={getStringValue(value)}
                      onChange={(e) => setSingleValue(question.id, e.target.value)}
                    />
                  ) : question.type === 'select' && question.allowMultiple ? (
                    <div className="space-y-2 mt-2">
                      {(question.options ?? []).map((option) => {
                        const checked = Array.isArray(value) ? value.includes(option) : false;
                        return (
                          <label
                            key={`${question.id}_${option}`}
                            className="flex items-center gap-2 p-2 rounded-md border border-border"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMultiSelectValue(question.id, option)}
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : question.type === 'select' ? (
                    <Select
                      value={getStringValue(value)}
                      onValueChange={(nextValue) => setSingleValue(question.id, nextValue)}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={question.placeholder || 'Select an option'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(question.options ?? []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : question.type === 'file' ? (
                    <div className="border border-border rounded-md p-3">
                      <input
                        type="file"
                        accept={question.accept || undefined}
                        className="text-sm"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setFileData((prev) => ({ ...prev, [question.id]: file }));
                          setErrors((prev) => ({ ...prev, [question.id]: '' }));
                        }}
                      />
                      {question.accept && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Accepted: {question.accept}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">Max 10 MB</p>
                    </div>
                  ) : question.type === 'number' ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      required={question.required}
                      placeholder={question.placeholder}
                      value={getStringValue(value)}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        if (NUMBER_REGEX.test(nextValue)) {
                          setSingleValue(question.id, nextValue);
                        }
                      }}
                    />
                  ) : (
                    <Input
                      type={question.type}
                      required={question.required}
                      placeholder={question.placeholder}
                      maxLength={question.type === 'text' ? 300 : undefined}
                      value={getStringValue(value)}
                      onChange={(e) => setSingleValue(question.id, e.target.value)}
                    />
                  )}

                  {question.type === 'text' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {getStringValue(value).length}/300 characters
                    </p>
                  )}

                  {error && <p className="text-sm text-destructive mt-1">{error}</p>}
                </div>
              );
            })}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isUploading ? 'Uploading files...' : isSubmitting ? 'Submitting...' : 'Submit Application'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
