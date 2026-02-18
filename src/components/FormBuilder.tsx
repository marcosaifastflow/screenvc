import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Plus, Trash2, GripVertical, Sparkles, Eye, Code } from 'lucide-react';
import { FormPreview } from './FormPreview';
import { EmbedCode } from './EmbedCode';
import { ThesisBuilder } from './ThesisBuilder';
import { ImportJsonDialog } from './ImportJsonDialog';
import { toast } from 'sonner';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getForm, getSavedThesisCriteria, getUserPrimaryForm, saveThesisCriteria } from '../utils/api';
import { clearStoredFormId, getStoredFormId, setStoredFormId } from '../utils/formStorage';

interface FormBuilderProps {
  onBack: () => void;
  onPublish: (
    formId: string,
    formName: string,
    questions: FormQuestion[],
    thesis: VCThesis
  ) => void;
  authState: {
    isAuthenticated: boolean;
    accessToken: string | null;
    user: SupabaseUser | null;
  };
  onLogout: () => void;
}

export interface FormQuestion {
  id: string;
  type: 'text' | 'textarea' | 'email' | 'url' | 'number' | 'select';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  allowMultiple?: boolean;
  locked?: boolean;
}

export interface VCThesis {
  stage: string[];
  sectors: string[];
  geography: string[];
  minRevenue?: string;
  maxRevenue?: string;
  customCriteria: string;
}

const DEFAULT_FORM_NAME = 'New Application Form';

const REQUIRED_QUESTIONS: FormQuestion[] = [
  {
    id: 'required_company_name',
    type: 'text',
    label: 'What is your company name?',
    placeholder: 'Enter your company name',
    required: true,
    locked: true,
  },
  {
    id: 'required_email',
    type: 'email',
    label: 'what is your email address?',
    placeholder: 'founder@startup.com',
    required: true,
    locked: true,
  },
  {
    id: 'required_one_liner',
    type: 'text',
    label: 'Explain in one line what your company does.',
    placeholder: 'Describe your company in one line',
    required: true,
    locked: true,
  },
];

const normalizeQuestion = (question: FormQuestion): FormQuestion => {
  const normalizedType = question.locked
    ? REQUIRED_QUESTIONS.find((requiredQuestion) => requiredQuestion.id === question.id)?.type ?? question.type
    : question.type;

  return {
    ...question,
    type: normalizedType,
    required: question.locked ? true : question.required,
    options:
      normalizedType === 'select'
        ? (question.options ?? ['Option 1']).filter((option) => option.trim().length > 0)
        : undefined,
    allowMultiple: normalizedType === 'select' ? Boolean(question.allowMultiple) : false,
    locked: Boolean(question.locked),
  };
};

const withRequiredQuestions = (incomingQuestions: FormQuestion[]): FormQuestion[] => {
  const normalizedIncoming = incomingQuestions.map(normalizeQuestion);
  const requiredLabels = new Set(REQUIRED_QUESTIONS.map((question) => question.label.trim().toLowerCase()));

  const dynamicQuestions = normalizedIncoming.filter(
    (question) =>
      !REQUIRED_QUESTIONS.some((requiredQuestion) => requiredQuestion.id === question.id) &&
      !requiredLabels.has(question.label.trim().toLowerCase()),
  );

  return [...REQUIRED_QUESTIONS, ...dynamicQuestions].map(normalizeQuestion);
};

const DEFAULT_QUESTIONS: FormQuestion[] = withRequiredQuestions([]);

const DEFAULT_THESIS: VCThesis = {
  stage: [],
  sectors: [],
  geography: [],
  customCriteria: '',
};

export function FormBuilder({ onBack, onPublish, authState, onLogout }: FormBuilderProps) {
  const userId = authState.user?.id ?? null;
  const loadedUserIdRef = useRef<string | null>(null);
  const [formName, setFormName] = useState(DEFAULT_FORM_NAME);
  const [questions, setQuestions] = useState<FormQuestion[]>(DEFAULT_QUESTIONS);
  const [thesis, setThesis] = useState<VCThesis>(DEFAULT_THESIS);

  const [activeTab, setActiveTab] = useState('build');
  const [isLoadingSavedForm, setIsLoadingSavedForm] = useState(true);
  const [isSavingCriteria, setIsSavingCriteria] = useState(false);

  const [publishedFormId, setPublishedFormId] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [lastPublishedState, setLastPublishedState] = useState<{
    formName: string;
    questions: FormQuestion[];
    thesis: VCThesis;
  } | null>(null);

  const hasUnsavedChanges = lastPublishedState
    ? formName !== lastPublishedState.formName ||
      JSON.stringify(questions) !== JSON.stringify(lastPublishedState.questions) ||
      JSON.stringify(thesis) !== JSON.stringify(lastPublishedState.thesis)
    : false;
  const isLivePublished = isPublished && !hasUnsavedChanges;

  useEffect(() => {
    let active = true;

    const resetToDefaultDraft = () => {
      setFormName(DEFAULT_FORM_NAME);
      setQuestions(DEFAULT_QUESTIONS);
      setThesis(DEFAULT_THESIS);
      setPublishedFormId(null);
      setIsPublished(false);
      setLastPublishedState(null);
    };

    const loadUserForm = async () => {
      if (!authState.isAuthenticated || !userId) {
        if (!active) return;
        loadedUserIdRef.current = null;
        resetToDefaultDraft();
        setIsLoadingSavedForm(false);
        return;
      }

      if (loadedUserIdRef.current === userId) {
        setIsLoadingSavedForm(false);
        return;
      }

      setIsLoadingSavedForm(true);

      const storedFormId = getStoredFormId(userId);
      const savedCriteriaResult = await getSavedThesisCriteria(authState.accessToken);
      const savedCriteria = savedCriteriaResult.success ? savedCriteriaResult.thesis : null;
      const primaryFormResult = await getUserPrimaryForm(authState.accessToken);

      if (!active) return;

      if (primaryFormResult.success && primaryFormResult.form) {
        const loadedQuestions = withRequiredQuestions(
          Array.isArray(primaryFormResult.form.questions)
            ? primaryFormResult.form.questions
            : DEFAULT_QUESTIONS,
        );
        const loadedThesis = savedCriteria ?? primaryFormResult.form.thesis ?? DEFAULT_THESIS;
        const formStatus = primaryFormResult.form.status ?? 'active';

        setFormName(primaryFormResult.form.formName || DEFAULT_FORM_NAME);
        setQuestions(loadedQuestions);
        setThesis(loadedThesis);
        setPublishedFormId(primaryFormResult.form.formId);
        setIsPublished(formStatus !== 'inactive');
        setLastPublishedState({
          formName: primaryFormResult.form.formName || DEFAULT_FORM_NAME,
          questions: loadedQuestions,
          thesis: loadedThesis,
        });
        setStoredFormId(userId, primaryFormResult.form.formId);
        loadedUserIdRef.current = userId;
        setIsLoadingSavedForm(false);
        return;
      }

      if (storedFormId) {
        const result = await Promise.race([
          getForm(storedFormId, authState.accessToken),
          new Promise<{
            success: false;
            error: string;
          }>((resolve) => {
            setTimeout(
              () => resolve({ success: false, error: 'Timed out while loading form' }),
              8000,
            );
          }),
        ]);

        if (!active) return;

        if (result.success && result.form) {
          const loadedQuestions = withRequiredQuestions(
            Array.isArray(result.form.questions) ? result.form.questions : DEFAULT_QUESTIONS,
          );
          const loadedThesis = savedCriteria ?? result.form.thesis ?? DEFAULT_THESIS;

          setFormName(result.form.formName || DEFAULT_FORM_NAME);
          setQuestions(loadedQuestions);
          setThesis(loadedThesis);
          setPublishedFormId(result.form.formId);
          setIsPublished(true);
          setLastPublishedState({
            formName: result.form.formName || DEFAULT_FORM_NAME,
            questions: loadedQuestions,
            thesis: loadedThesis,
          });
          loadedUserIdRef.current = userId;
          setIsLoadingSavedForm(false);
          return;
        }

        if (primaryFormResult.success) {
          clearStoredFormId(userId);
        }
      }

      setFormName(DEFAULT_FORM_NAME);
      setQuestions(DEFAULT_QUESTIONS);
      setThesis(savedCriteria ?? DEFAULT_THESIS);
      setPublishedFormId(null);
      setIsPublished(false);
      setLastPublishedState(null);
      loadedUserIdRef.current = userId;
      setIsLoadingSavedForm(false);
    };

    loadUserForm();

    return () => {
      active = false;
    };
  }, [authState.isAuthenticated, authState.accessToken, userId]);

  const handlePublishSuccess = (formId: string) => {
    setPublishedFormId(formId);
    setIsPublished(true);
    setLastPublishedState({ formName, questions, thesis });
    if (userId) {
      setStoredFormId(userId, formId);
    }
  };

  const handleUnpublish = () => {
    setIsPublished(false);
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: Date.now().toString(),
        type: 'text',
        label: 'New Question',
        placeholder: 'Enter your answer',
        required: false,
      },
    ]);
  };

  const updateQuestion = (id: string, updates: Partial<FormQuestion>) => {
    setQuestions(
      questions.map((question) => {
        if (question.id !== id) {
          return question;
        }

        const nextQuestion = normalizeQuestion({ ...question, ...updates });
        return question.locked ? { ...nextQuestion, required: true, type: question.type } : nextQuestion;
      }),
    );
  };

  const deleteQuestion = (id: string) => {
    const targetQuestion = questions.find((question) => question.id === id);
    if (targetQuestion?.locked) {
      toast.error('This question is mandatory and cannot be removed.');
      return;
    }

    setQuestions(questions.filter((question) => question.id !== id));
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetQuestion = questions[index];
    if (targetQuestion?.locked) {
      return;
    }

    const newQuestions = [...questions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < REQUIRED_QUESTIONS.length || targetIndex >= newQuestions.length) return;

    [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]];
    setQuestions(newQuestions);
  };

  const addSelectOption = (questionId: string) => {
    const question = questions.find((item) => item.id === questionId);
    if (!question || question.type !== 'select') return;

    const nextOptions = [...(question.options ?? []), `Option ${(question.options?.length ?? 0) + 1}`];
    updateQuestion(questionId, { options: nextOptions });
  };

  const updateSelectOption = (questionId: string, optionIndex: number, value: string) => {
    const question = questions.find((item) => item.id === questionId);
    if (!question || question.type !== 'select') return;

    const nextOptions = [...(question.options ?? [])];
    nextOptions[optionIndex] = value;
    updateQuestion(questionId, { options: nextOptions });
  };

  const removeSelectOption = (questionId: string, optionIndex: number) => {
    const question = questions.find((item) => item.id === questionId);
    if (!question || question.type !== 'select') return;

    const nextOptions = (question.options ?? []).filter((_, idx) => idx !== optionIndex);
    updateQuestion(questionId, { options: nextOptions.length > 0 ? nextOptions : ['Option 1'] });
  };

  const handleImportJson = (importedQuestions: FormQuestion[]) => {
    setQuestions(withRequiredQuestions(importedQuestions));
    toast.success(`Successfully imported ${importedQuestions.length} questions!`);
  };

  const handleSaveCriteria = async () => {
    setIsSavingCriteria(true);
    try {
      const result = await saveThesisCriteria({
        thesis,
        accessToken: authState.accessToken,
      });
      if (!result.success) {
        toast.error(result.error || 'Failed to save criteria');
        return;
      }
      toast.success('VC thesis criteria saved');
    } catch (error) {
      toast.error('Failed to save criteria');
      console.error('[SAVE CRITERIA]', error);
    } finally {
      setIsSavingCriteria(false);
    }
  };

  if (isLoadingSavedForm) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading your form...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-background sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="text-2xl font-bold border-none px-0 h-auto py-2 focus-visible:ring-0"
          />

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start bg-[#FFD023]">
              <TabsTrigger value="build" className="gap-2">
                <Plus className="size-4" /> Build Form
              </TabsTrigger>
              <TabsTrigger value="thesis" className="gap-2">
                <Sparkles className="size-4" /> VC Thesis
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2">
                <Eye className="size-4" /> Preview
              </TabsTrigger>
              <TabsTrigger value="embed" className="gap-2">
                <Code className="size-4" /> Publish
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="build">
            <Card className="p-6 mb-6">
              <p className="text-sm text-muted-foreground mb-4">
                The first three questions are mandatory for all forms and power your results dashboard.
              </p>

              {questions.map((question, index) => (
                <Card key={question.id} className="p-4 mb-4 bg-muted/30">
                  <div className="flex gap-3">
                    <button onClick={() => moveQuestion(index, 'up')} disabled={Boolean(question.locked)}>
                      <GripVertical className="size-4" />
                    </button>

                    <div className="flex-1 space-y-3">
                      <Input
                        value={question.label}
                        disabled={Boolean(question.locked)}
                        onChange={(e) => updateQuestion(question.id, { label: e.target.value })}
                      />

                      <Input
                        value={question.placeholder ?? ''}
                        placeholder="Placeholder"
                        onChange={(e) => updateQuestion(question.id, { placeholder: e.target.value })}
                      />

                      <div className="grid md:grid-cols-2 gap-3">
                        <Select
                          value={question.type}
                          onValueChange={(value) =>
                            updateQuestion(question.id, {
                              type: value as FormQuestion['type'],
                            })
                          }
                          disabled={Boolean(question.locked)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="textarea">Long Text</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="url">URL</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="select">Select</SelectItem>
                          </SelectContent>
                        </Select>

                        {question.type === 'select' && (
                          <Select
                            value={question.allowMultiple ? 'multiple' : 'single'}
                            onValueChange={(value) =>
                              updateQuestion(question.id, {
                                allowMultiple: value === 'multiple',
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Single select</SelectItem>
                              <SelectItem value="multiple">Multi select</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {question.type === 'select' && (
                        <div className="space-y-2">
                          {(question.options ?? []).map((option, optionIndex) => (
                            <div key={`${question.id}_${optionIndex}`} className="flex gap-2">
                              <Input
                                value={option}
                                onChange={(e) =>
                                  updateSelectOption(question.id, optionIndex, e.target.value)
                                }
                                placeholder={`Option ${optionIndex + 1}`}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => removeSelectOption(question.id, optionIndex)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => addSelectOption(question.id)}
                          >
                            <Plus className="size-4 mr-2" /> Add Option
                          </Button>
                        </div>
                      )}
                    </div>

                    <Button variant="ghost" onClick={() => deleteQuestion(question.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Card>
              ))}

              <Button variant="outline" onClick={addQuestion} className="w-full">
                <Plus className="size-4 mr-2" /> Add Question
              </Button>
              <div className="mt-3">
                <ImportJsonDialog onImport={handleImportJson} />
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="thesis">
            <ThesisBuilder
              thesis={thesis}
              setThesis={setThesis}
              onSaveCriteria={handleSaveCriteria}
              isSavingCriteria={isSavingCriteria}
            />
          </TabsContent>

          <TabsContent value="preview">
            <FormPreview formName={formName} questions={questions} />
          </TabsContent>

          <TabsContent value="embed">
            <EmbedCode
              formName={formName}
              questions={questions}
              thesis={thesis}
              onPublish={onPublish}
              isPublicView={false}
              authState={authState}
              publishedFormId={publishedFormId}
              handlePublishSuccess={handlePublishSuccess}
              handleUnpublish={handleUnpublish}
              isPublished={isLivePublished}
              hasUnsavedChanges={hasUnsavedChanges}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
