import { Card } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, FileText, Calendar, User, Building2 } from 'lucide-react';

interface FormSubmission {
  id: string;
  formId: string;
  formName?: string;
  submittedAt: string;
  data: Record<string, string>;
}

interface FormDashboardProps {
  onBack: () => void;
}

export function FormDashboard({ onBack }: FormDashboardProps) {
  // Load submissions from localStorage
  const loadSubmissions = (): FormSubmission[] => {
    try {
      const stored = localStorage.getItem('screenvc_form_submissions');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
    }
    return [];
  };

  const submissions = loadSubmissions();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-muted/30 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="size-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl">Form Dashboard</h1>
                <p className="text-sm text-muted-foreground">View and manage all form submissions</p>
              </div>
            </div>
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="size-4 mr-2" />
              Back to Builder
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total Submissions</span>
              <FileText className="size-4 text-primary" />
            </div>
            <p className="text-3xl font-semibold">{submissions.length}</p>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Under Review</span>
              <Calendar className="size-4 text-primary" />
            </div>
            <p className="text-3xl font-semibold">{submissions.length}</p>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">AI Analyzed</span>
              <User className="size-4 text-primary" />
            </div>
            <p className="text-3xl font-semibold">{submissions.length}</p>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Response Rate</span>
              <Building2 className="size-4 text-primary" />
            </div>
            <p className="text-3xl font-semibold">100%</p>
          </Card>
        </div>

        {/* Submissions List */}
        <Card className="p-6">
          <h2 className="mb-6">Recent Submissions</h2>
          
          {submissions.length === 0 ? (
            <div className="text-center py-12">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <FileText className="size-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2">No Submissions Yet</h3>
              <p className="text-muted-foreground mb-6">
                Form submissions will appear here once founders start applying.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {submissions.map((submission) => (
                <Card key={submission.id} className="p-4 hover:border-primary/20 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="size-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">
                          {submission.data['Company Name'] || 
                           submission.data['Startup Name'] || 
                           submission.data['Name'] ||
                           submission.formName || 
                           'Application'}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {submission.data['Email'] || 
                           submission.data['Contact Email'] || 
                           submission.data['Your Email'] ||
                           'No email provided'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="size-4" />
                        {new Date(submission.submittedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    {Object.entries(submission.data).slice(0, 4).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-muted-foreground">{key}:</span>
                        <p className="truncate">{value}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/10 text-primary">
                        AI Reviewed
                      </span>
                    </div>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
