import { useEffect, useMemo, useState } from 'react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Calendar, FileText, Heart } from 'lucide-react';
import {
  getForm,
  getFormFavorites,
  getFormSubmissions,
  getUserPrimaryForm,
  toggleFavoriteSubmission,
} from '../utils/api';
import { getStoredFormId, setStoredFormId } from '../utils/formStorage';
import { toast } from 'sonner';

interface FormResultsPageProps {
  userId: string | null;
  accessToken?: string | null;
  onBackToHub: () => void;
  onOpenBuilder: () => void;
  onOpenApplication: (submissionId: string) => void;
}

interface Submission {
  submissionId: string;
  formId: string;
  data: Record<string, string | string[]>;
  isHighLevel: boolean;
  isHighValue?: boolean;
  submittedAt: string;
}

type FilterType = 'all' | 'favourites' | 'highValue';

const findStringAnswer = (data: Record<string, string | string[]>, labels: string[]) => {
  const normalizedMap = new Map<string, string>();

  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'string') {
      normalizedMap.set(key.trim().toLowerCase(), value);
      return;
    }

    if (Array.isArray(value)) {
      normalizedMap.set(key.trim().toLowerCase(), value.join(', '));
    }
  });

  for (const label of labels) {
    const value = normalizedMap.get(label.trim().toLowerCase());
    if (value && value.trim()) {
      return value;
    }
  }

  return '';
};

export function FormResultsPage({
  userId,
  accessToken,
  onBackToHub,
  onOpenBuilder,
  onOpenApplication,
}: FormResultsPageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [formName, setFormName] = useState('Published Form');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [publishedFormId, setPublishedFormId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [favoriteSubmissionIds, setFavoriteSubmissionIds] = useState<string[]>([]);
  const [favoriteActionId, setFavoriteActionId] = useState<string | null>(null);

  const highValueCount = submissions.filter(
    (submission) => submission.isHighValue === true || submission.isHighLevel === true,
  ).length;

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!userId) {
        if (!active) return;
        setError('You must be logged in to view submissions.');
        setIsLoading(false);
        return;
      }

      let formId = getStoredFormId(userId);
      if (!formId) {
        const primaryFormResult = await getUserPrimaryForm(accessToken);
        if (!active) return;

        if (primaryFormResult.success && primaryFormResult.form?.formId) {
          formId = primaryFormResult.form.formId;
          setStoredFormId(userId, formId);
        } else if (primaryFormResult.success) {
          setPublishedFormId(null);
          setIsLoading(false);
          return;
        } else {
          setError(primaryFormResult.error || 'Failed to load your form');
          setIsLoading(false);
          return;
        }
      }

      if (!formId) {
        if (!active) return;
        setPublishedFormId(null);
        setIsLoading(false);
        return;
      }

      if (!active) return;
      setPublishedFormId(formId);
      setIsLoading(true);
      setError('');

      const [formResult, submissionsResult, favoritesResult] = await Promise.all([
        getForm(formId, accessToken),
        getFormSubmissions(formId),
        getFormFavorites(formId, accessToken),
      ]);
      if (!active) return;

      if (formResult.success && formResult.form?.formName) {
        setFormName(formResult.form.formName);
      }

      if (!submissionsResult.success) {
        setError(submissionsResult.error || 'Failed to load submissions');
        setSubmissions([]);
        setIsLoading(false);
        return;
      }

      if (favoritesResult.success) {
        setFavoriteSubmissionIds(favoritesResult.favorites);
      } else {
        setFavoriteSubmissionIds([]);
      }

      setSubmissions(submissionsResult.submissions);
      setIsLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [userId, accessToken]);

  const filteredSubmissions = useMemo(() => {
    if (activeFilter === 'favourites') {
      const favoriteSet = new Set(favoriteSubmissionIds);
      return submissions.filter((submission) => favoriteSet.has(submission.submissionId));
    }

    if (activeFilter === 'highValue') {
      return submissions.filter(
        (submission) => submission.isHighValue === true || submission.isHighLevel === true,
      );
    }

    return submissions;
  }, [activeFilter, favoriteSubmissionIds, submissions]);

  const handleToggleFavorite = async (submissionId: string) => {
    if (!publishedFormId) return;

    const previousFavorites = favoriteSubmissionIds;
    const isCurrentlyFavorite = previousFavorites.includes(submissionId);
    const optimisticFavorites = isCurrentlyFavorite
      ? previousFavorites.filter((id) => id !== submissionId)
      : [...previousFavorites, submissionId];

    setFavoriteSubmissionIds(optimisticFavorites);
    setFavoriteActionId(submissionId);

    const result = await toggleFavoriteSubmission({
      formId: publishedFormId,
      submissionId,
      accessToken,
    });

    if (!result.success) {
      setFavoriteSubmissionIds(previousFavorites);
      toast.error(result.error || 'Failed to update favourites');
      setFavoriteActionId(null);
      return;
    }

    setFavoriteSubmissionIds(result.favorites);
    setFavoriteActionId(null);
  };

  const renderEmptyStateText = () => {
    if (activeFilter === 'favourites') {
      return 'No favourite submissions yet. Click the heart icon to save one.';
    }

    if (activeFilter === 'highValue') {
      return 'No high-value opportunities found yet.';
    }

    return 'When founders submit your form, their entries will appear here.';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8">
        {isLoading && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading submissions...</p>
          </Card>
        )}

        {!isLoading && !publishedFormId && (
          <Card className="p-8 text-center">
            <h2 className="mb-2">No Published Form Yet</h2>
            <p className="text-muted-foreground mb-6">
              Publish your form first. Submissions will appear here after founders apply.
            </p>
            <Button onClick={onOpenBuilder}>Go to Form Builder</Button>
          </Card>
        )}

        {!isLoading && publishedFormId && error && (
          <Card className="p-8 text-center">
            <h2 className="mb-2">Could Not Load Submissions</h2>
            <p className="text-muted-foreground">{error}</p>
          </Card>
        )}

        {!isLoading && publishedFormId && !error && (
          <>
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <Card className="p-6 bg-primary text-primary-foreground border-primary">
                <p className="text-sm text-primary-foreground/80 mb-2">Total Submissions</p>
                <p className="text-3xl font-semibold">{submissions.length}</p>
              </Card>
              <Card className="p-6 bg-primary text-primary-foreground border-primary">
                <p className="text-sm text-primary-foreground/80 mb-2">Latest Submission</p>
                <p className="text-3xl font-semibold">
                  {submissions[0] ? new Date(submissions[0].submittedAt).toLocaleDateString() : '-'}
                </p>
              </Card>
              <Card className="p-6 bg-primary text-primary-foreground border-primary">
                <p className="text-sm text-primary-foreground/80 mb-2">High-Value Opportunities</p>
                <p className="text-3xl font-semibold">{highValueCount}</p>
              </Card>
            </div>

            <Card className="p-6">
              <h2 className="mb-4">Submissions</h2>

              <div className="flex flex-wrap gap-2 mb-6">
                <Button
                  variant={activeFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setActiveFilter('all')}
                >
                  All
                </Button>
                <Button
                  variant={activeFilter === 'favourites' ? 'default' : 'outline'}
                  onClick={() => setActiveFilter('favourites')}
                >
                  Favourites
                </Button>
                <Button
                  variant={activeFilter === 'highValue' ? 'default' : 'outline'}
                  onClick={() => setActiveFilter('highValue')}
                >
                  High-Value Opportunity
                </Button>
              </div>

              {filteredSubmissions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <FileText className="size-8 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2">No Submissions Found</h3>
                  <p className="text-muted-foreground">{renderEmptyStateText()}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredSubmissions.map((submission) => {
                    const companyName =
                      findStringAnswer(submission.data, ['What is your company name?', 'Company Name']) ||
                      'Unnamed company';
                    const email =
                      findStringAnswer(submission.data, ['what is your email address?', 'Email Address']) ||
                      '-';
                    const oneLiner =
                      findStringAnswer(submission.data, [
                        'Explain in one line what your company does.',
                        'One Liner',
                      ]) || '-';
                    const isFavorite = favoriteSubmissionIds.includes(submission.submissionId);

                    return (
                      <Card key={submission.submissionId} className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{companyName}</h3>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={favoriteActionId === submission.submissionId}
                              onClick={() => handleToggleFavorite(submission.submissionId)}
                              aria-label={isFavorite ? 'Remove from favourites' : 'Save to favourites'}
                            >
                              <Heart
                                fill={isFavorite ? 'currentColor' : 'none'}
                                className={`size-4 ${
                                  isFavorite ? 'fill-primary text-primary' : 'text-muted-foreground'
                                }`}
                              />
                            </Button>
                          </div>
                          <div className="flex flex-col sm:items-end gap-2">
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Calendar className="size-4" />
                              {new Date(submission.submittedAt).toLocaleString()}
                            </p>
                            <Button size="sm" onClick={() => onOpenApplication(submission.submissionId)}>
                              View Application
                            </Button>
                          </div>
                        </div>

                        <p className="text-sm text-muted-foreground mb-1">{email}</p>
                        <p className="text-sm mb-3">{oneLiner}</p>

                        {(submission.isHighValue === true || submission.isHighLevel === true) && (
                          <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">
                            High Value Opportunity
                          </Badge>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
