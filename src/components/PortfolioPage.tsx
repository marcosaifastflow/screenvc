import { useEffect, useState, useMemo } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from './ui/chart';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  Briefcase,
  DollarSign,
  Building2,
  TrendingUp,
  ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getPortfolio,
  addPortfolioCompany,
  updatePortfolioCompany,
  deletePortfolioCompany,
  getPortfolioRecommendations,
  type PortfolioCompany,
  type PortfolioRecommendation,
} from '../utils/api';

interface PortfolioPageProps {
  accessToken?: string | null;
  onBackToHub: () => void;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7c7c',
  '#a4de6c',
];

const FUNDING_STAGES = ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'growth'] as const;
const STATUS_OPTIONS = ['active', 'exited', 'written-off'] as const;
const CONTINENTS = ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania'] as const;

type SortField = 'companyName' | 'dealSize' | 'fundingStage' | 'country' | 'investmentDate';
type SortDir = 'asc' | 'desc';

const stageOrder: Record<string, number> = {
  'pre-seed': 0,
  seed: 1,
  'series-a': 2,
  'series-b': 3,
  'series-c': 4,
  growth: 5,
};

const formatCurrency = (value: number | null) => {
  if (value == null) return '-';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
};

const emptyForm = {
  companyName: '',
  industry: '',
  country: '',
  continent: '',
  fundingStage: '',
  dealSize: '',
  investmentDate: '',
  valuation: '',
  equityPercent: '',
  status: 'active',
  submissionId: '',
  notes: '',
};

export function PortfolioPage({ accessToken, onBackToHub }: PortfolioPageProps) {
  const [companies, setCompanies] = useState<PortfolioCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const [sortField, setSortField] = useState<SortField>('investmentDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterStage, setFilterStage] = useState<string>('all');

  const [recommendations, setRecommendations] = useState<PortfolioRecommendation[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);

  // Load portfolio
  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      const result = await getPortfolio(accessToken);
      if (!active) return;
      if (result.success) {
        setCompanies(result.companies);
      } else {
        toast.error(result.error || 'Failed to load portfolio');
      }
      setIsLoading(false);
    };
    load();
    return () => { active = false; };
  }, [accessToken]);

  // KPIs
  const kpis = useMemo(() => {
    const total = companies.reduce((sum, c) => sum + (c.dealSize ?? 0), 0);
    const avg = companies.length > 0 ? total / companies.length : 0;
    const active = companies.filter((c) => c.status === 'active').length;
    const exited = companies.filter((c) => c.status === 'exited').length;
    const writtenOff = companies.filter((c) => c.status === 'written-off').length;
    return { total, count: companies.length, avg, active, exited, writtenOff };
  }, [companies]);

  // Chart data
  const industryData = useMemo(() => {
    const map = new Map<string, number>();
    companies.forEach((c) => {
      const key = c.industry || 'Other';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [companies]);

  const countryData = useMemo(() => {
    const map = new Map<string, number>();
    companies.forEach((c) => {
      const key = c.country || 'Unknown';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [companies]);

  const continentData = useMemo(() => {
    const map = new Map<string, number>();
    companies.forEach((c) => {
      const key = c.continent || 'Unknown';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [companies]);

  const stageData = useMemo(() => {
    const map = new Map<string, number>();
    FUNDING_STAGES.forEach((s) => map.set(s, 0));
    companies.forEach((c) => {
      const key = c.fundingStage || 'unknown';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [companies]);

  // Sorted & filtered list
  const displayCompanies = useMemo(() => {
    let list = [...companies];
    if (filterStage !== 'all') {
      list = list.filter((c) => c.fundingStage === filterStage);
    }
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'companyName':
          cmp = (a.companyName ?? '').localeCompare(b.companyName ?? '');
          break;
        case 'dealSize':
          cmp = (a.dealSize ?? 0) - (b.dealSize ?? 0);
          break;
        case 'fundingStage':
          cmp = (stageOrder[a.fundingStage ?? ''] ?? 99) - (stageOrder[b.fundingStage ?? ''] ?? 99);
          break;
        case 'country':
          cmp = (a.country ?? '').localeCompare(b.country ?? '');
          break;
        case 'investmentDate':
          cmp = new Date(a.investmentDate ?? 0).getTime() - new Date(b.investmentDate ?? 0).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [companies, sortField, sortDir, filterStage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const openAddDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (company: PortfolioCompany) => {
    setEditingId(company.id);
    setForm({
      companyName: company.companyName,
      industry: company.industry ?? '',
      country: company.country ?? '',
      continent: company.continent ?? '',
      fundingStage: company.fundingStage ?? '',
      dealSize: company.dealSize != null ? String(company.dealSize) : '',
      investmentDate: company.investmentDate ?? '',
      valuation: company.valuation != null ? String(company.valuation) : '',
      equityPercent: company.equityPercent != null ? String(company.equityPercent) : '',
      status: company.status,
      submissionId: company.submissionId ?? '',
      notes: company.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) {
      toast.error('Company name is required');
      return;
    }

    setIsSaving(true);
    const payload = {
      companyName: form.companyName.trim(),
      industry: form.industry || null,
      country: form.country || null,
      continent: form.continent || null,
      fundingStage: form.fundingStage || null,
      dealSize: form.dealSize ? Number(form.dealSize) : null,
      investmentDate: form.investmentDate || null,
      valuation: form.valuation ? Number(form.valuation) : null,
      equityPercent: form.equityPercent ? Number(form.equityPercent) : null,
      status: (form.status as PortfolioCompany['status']) || 'active',
      submissionId: form.submissionId || null,
      notes: form.notes || null,
    };

    if (editingId) {
      const result = await updatePortfolioCompany(editingId, payload, accessToken);
      if (result.success && result.company) {
        setCompanies((prev) => prev.map((c) => (c.id === editingId ? result.company! : c)));
        toast.success('Company updated');
      } else {
        toast.error(result.error || 'Failed to update');
      }
    } else {
      const result = await addPortfolioCompany(payload, accessToken);
      if (result.success && result.company) {
        setCompanies((prev) => [result.company!, ...prev]);
        toast.success('Company added');
      } else {
        toast.error(result.error || 'Failed to add');
      }
    }

    setIsSaving(false);
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    const result = await deletePortfolioCompany(id, accessToken);
    if (result.success) {
      setCompanies((prev) => prev.filter((c) => c.id !== id));
      toast.success('Company removed');
    } else {
      toast.error(result.error || 'Failed to delete');
    }
  };

  const handleGetRecommendations = async () => {
    setIsLoadingRecs(true);
    const result = await getPortfolioRecommendations(accessToken);
    if (result.success) {
      setRecommendations(result.recommendations);
      if (result.recommendations.length === 0) {
        toast.info('No recommendations available. Add more companies or form submissions.');
      }
    } else {
      toast.error(result.error || 'Failed to get recommendations');
    }
    setIsLoadingRecs(false);
  };

  // Chart configs
  const industryChartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    industryData.forEach((d, i) => {
      config[d.name] = { label: d.name, color: COLORS[i % COLORS.length] };
    });
    return config;
  }, [industryData]);

  const continentChartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    continentData.forEach((d, i) => {
      config[d.name] = { label: d.name, color: COLORS[i % COLORS.length] };
    });
    return config;
  }, [continentData]);

  const barChartConfig: ChartConfig = {
    value: { label: 'Count', color: 'hsl(var(--chart-1))' },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-muted/30 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBackToHub}>
              <ArrowLeft className="size-5" />
            </Button>
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Briefcase className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl">My Portfolio</h1>
              <p className="text-sm text-muted-foreground">
                Track your startup investments and portfolio analytics
              </p>
            </div>
          </div>
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="size-4" />
            Add Company
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <DollarSign className="size-4 text-green-600" />
              </div>
              <p className="text-sm text-muted-foreground">Total Invested</p>
            </div>
            <p className="text-2xl font-semibold">{formatCurrency(kpis.total)}</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Building2 className="size-4 text-blue-600" />
              </div>
              <p className="text-sm text-muted-foreground">Companies</p>
            </div>
            <p className="text-2xl font-semibold">{kpis.count}</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="size-4 text-purple-600" />
              </div>
              <p className="text-sm text-muted-foreground">Avg Deal Size</p>
            </div>
            <p className="text-2xl font-semibold">{formatCurrency(kpis.avg)}</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Briefcase className="size-4 text-orange-600" />
              </div>
              <p className="text-sm text-muted-foreground">Status</p>
            </div>
            <p className="text-sm">
              <span className="text-green-600 font-medium">{kpis.active} active</span>
              {' / '}
              <span className="text-blue-600 font-medium">{kpis.exited} exited</span>
              {' / '}
              <span className="text-red-600 font-medium">{kpis.writtenOff} written-off</span>
            </p>
          </Card>
        </div>

        {/* Charts */}
        {companies.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Industry Allocation Pie */}
            <Card className="p-6">
              <h3 className="font-medium mb-4">Industry Allocation</h3>
              <ChartContainer config={industryChartConfig} className="h-[260px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={industryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {industryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </Card>

            {/* Country Bar Chart */}
            <Card className="p-6">
              <h3 className="font-medium mb-4">Geographic Distribution (Countries)</h3>
              <ChartContainer config={barChartConfig} className="h-[260px] w-full">
                <BarChart data={countryData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </Card>

            {/* Continent Pie */}
            <Card className="p-6">
              <h3 className="font-medium mb-4">Geographic Distribution (Continents)</h3>
              <ChartContainer config={continentChartConfig} className="h-[260px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={continentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {continentData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </Card>

            {/* Funding Stage Bar */}
            <Card className="p-6">
              <h3 className="font-medium mb-4">Funding Stage Distribution</h3>
              <ChartContainer config={barChartConfig} className="h-[260px] w-full">
                <BarChart data={stageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </Card>
          </div>
        )}

        {/* Sort & Filter toolbar */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Sort:</span>
            {(['companyName', 'dealSize', 'fundingStage', 'country', 'investmentDate'] as SortField[]).map(
              (field) => (
                <Button
                  key={field}
                  variant={sortField === field ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort(field)}
                >
                  {field === 'companyName'
                    ? 'Name'
                    : field === 'dealSize'
                      ? 'Deal Size'
                      : field === 'fundingStage'
                        ? 'Stage'
                        : field === 'country'
                          ? 'Country'
                          : 'Date'}
                  {sortField === field && (sortDir === 'asc' ? ' \u2191' : ' \u2193')}
                </Button>
              ),
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter stage:</span>
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {FUNDING_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Portfolio Table */}
        <Card>
          {displayCompanies.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              {companies.length === 0
                ? 'No companies in your portfolio yet. Click "Add Company" to get started.'
                : 'No companies match the current filter.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Deal Size</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayCompanies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">{company.companyName}</TableCell>
                    <TableCell>{company.industry || '-'}</TableCell>
                    <TableCell>{company.fundingStage || '-'}</TableCell>
                    <TableCell>{company.country || '-'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(company.dealSize)}</TableCell>
                    <TableCell>{company.investmentDate || '-'}</TableCell>
                    <TableCell>
                      <span
                        className={
                          company.status === 'active'
                            ? 'text-green-600'
                            : company.status === 'exited'
                              ? 'text-blue-600'
                              : 'text-red-600'
                        }
                      >
                        {company.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => openEditDialog(company)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          onClick={() => handleDelete(company.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* AI Recommendations */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                AI Investment Recommendations
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Get AI-powered suggestions for your next investment based on portfolio gaps and form applicants.
              </p>
            </div>
            <Button onClick={handleGetRecommendations} disabled={isLoadingRecs} className="gap-2">
              {isLoadingRecs ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isLoadingRecs ? 'Analyzing...' : 'Get AI Recommendations'}
            </Button>
          </div>

          {recommendations.length > 0 && (
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <Card key={i} className="p-4 bg-muted/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-medium">{rec.companyName}</h4>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Fit Score: {rec.fitScore}/10
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{rec.rationale}</p>
                      {rec.diversificationBenefit && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="font-medium">Diversification:</span>{' '}
                          {rec.diversificationBenefit}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Company' : 'Add Company'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Company Name *</Label>
              <Input
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="Acme Inc."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Industry</Label>
                <Input
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  placeholder="e.g. FinTech"
                />
              </div>
              <div>
                <Label>Funding Stage</Label>
                <Select
                  value={form.fundingStage}
                  onValueChange={(v) => setForm((f) => ({ ...f, fundingStage: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUNDING_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Country</Label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  placeholder="e.g. United States"
                />
              </div>
              <div>
                <Label>Continent</Label>
                <Select
                  value={form.continent}
                  onValueChange={(v) => setForm((f) => ({ ...f, continent: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select continent" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTINENTS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Deal Size (USD)</Label>
                <Input
                  type="number"
                  value={form.dealSize}
                  onChange={(e) => setForm((f) => ({ ...f, dealSize: e.target.value }))}
                  placeholder="500000"
                />
              </div>
              <div>
                <Label>Valuation (USD)</Label>
                <Input
                  type="number"
                  value={form.valuation}
                  onChange={(e) => setForm((f) => ({ ...f, valuation: e.target.value }))}
                  placeholder="5000000"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Equity %</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.equityPercent}
                  onChange={(e) => setForm((f) => ({ ...f, equityPercent: e.target.value }))}
                  placeholder="10"
                />
              </div>
              <div>
                <Label>Investment Date</Label>
                <Input
                  type="date"
                  value={form.investmentDate}
                  onChange={(e) => setForm((f) => ({ ...f, investmentDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes about this investment..."
                rows={3}
              />
            </div>
            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : editingId ? (
                'Update Company'
              ) : (
                'Add Company'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
