import { Card } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import type { FormQuestion } from './FormBuilder';
import { Sparkles } from 'lucide-react';

interface FormPreviewProps {
  formName: string;
  questions: FormQuestion[];
}

export function FormPreview({ formName, questions }: FormPreviewProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 text-center">
        <h2 className="mb-2">Form Preview</h2>
        <p className="text-muted-foreground">
          This is how your application form will appear to founders
        </p>
      </div>

      <Card className="p-8">
        <div className="mb-8 pb-6 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="size-6 text-primary" />
            <span className="text-xl font-semibold">ScreenVC</span>
          </div>
          <h1 className="mb-2">{formName}</h1>
          <p className="text-muted-foreground">
            This application will be reviewed by our AI-powered screening system to ensure your startup
            gets the attention it deserves.
          </p>
        </div>

        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          {questions.map((question) => (
            <div key={question.id}>
              <Label className="mb-2 block">
                {question.label}
                {question.required && <span className="text-destructive ml-1">*</span>}
              </Label>

              {question.type === 'textarea' ? (
                <Textarea
                  placeholder={question.placeholder}
                  required={question.required}
                  rows={4}
                  disabled
                />
              ) : question.type === 'select' && question.allowMultiple ? (
                <div className="space-y-2">
                  {(question.options ?? []).map((option) => (
                    <label
                      key={`${question.id}_${option}`}
                      className="flex items-center gap-2 p-2 rounded-md border border-border"
                    >
                      <input type="checkbox" disabled />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              ) : question.type === 'select' ? (
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder={question.placeholder || 'Select an option'} />
                  </SelectTrigger>
                  <SelectContent>
                    {question.options?.map((option, idx) => (
                      <SelectItem key={idx} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : question.type === 'file' ? (
                <div className="border border-border rounded-md p-3 bg-muted/30">
                  <input
                    type="file"
                    accept={question.accept || undefined}
                    disabled
                    className="text-sm text-muted-foreground"
                  />
                  {question.accept && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Accepted: {question.accept}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Max 10 MB</p>
                </div>
              ) : (
                <Input
                  type={question.type === 'number' ? 'text' : question.type}
                  inputMode={question.type === 'number' ? 'decimal' : undefined}
                  placeholder={question.placeholder}
                  required={question.required}
                  maxLength={question.type === 'text' ? 300 : undefined}
                  disabled
                />
              )}

              {question.type === 'text' && (
                <p className="text-xs text-muted-foreground mt-1">Maximum 300 characters</p>
              )}
            </div>
          ))}

          <div className="pt-4">
            <Button type="submit" className="w-full" disabled>
              Submit Application
            </Button>
            <p className="text-sm text-muted-foreground text-center mt-3">
              Your application will be analyzed by AI within 24-48 hours
            </p>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            <span>Powered by ScreenVC AI Screening</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
