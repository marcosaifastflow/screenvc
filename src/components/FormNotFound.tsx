import { Card } from './ui/card';
import { Button } from './ui/button';
import { AlertCircle, ArrowLeft } from 'lucide-react';

interface FormNotFoundProps {
  formId: string;
}

export function FormNotFound({ formId }: FormNotFoundProps) {
  const handleBackToHome = () => {
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-2xl w-full p-8 text-center">
        <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="size-8 text-destructive" />
        </div>
        <h1 className="mb-4">Form Not Found or Expired</h1>
        <p className="text-muted-foreground mb-6">
          The form you're trying to access (ID: <code className="bg-muted px-2 py-1 rounded text-sm">{formId}</code>) doesn't exist, has been removed, or the link has been replaced with a newer version.
        </p>
        <div className="bg-muted/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-muted-foreground">
            <strong>Why might this happen?</strong>
          </p>
          <ul className="text-sm text-muted-foreground text-left mt-2 space-y-1 max-w-md mx-auto">
            <li>• The VC republished the form with a new link</li>
            <li>• The form has been deleted</li>
            <li>• The link was typed incorrectly</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-4">
            Please contact the person who shared this link for the latest version.
          </p>
        </div>
        <Button onClick={handleBackToHome} variant="outline">
          <ArrowLeft className="size-4 mr-2" />
          Go to ScreenVC Home
        </Button>
      </Card>
    </div>
  );
}