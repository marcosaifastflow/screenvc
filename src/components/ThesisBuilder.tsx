import { Card } from './ui/card';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { X, Plus } from 'lucide-react';
import { useState } from 'react';
import type { VCThesis } from './FormBuilder';
import { Button } from './ui/button';

interface ThesisBuilderProps {
  thesis: VCThesis;
  setThesis: (thesis: VCThesis) => void;
  onSaveCriteria?: () => void;
  isSavingCriteria?: boolean;
}

export function ThesisBuilder({
  thesis,
  setThesis,
  onSaveCriteria,
  isSavingCriteria = false,
}: ThesisBuilderProps) {
  const [stageInput, setStageInput] = useState('');
  const [sectorInput, setSectorInput] = useState('');
  const [geoInput, setGeoInput] = useState('');

  const addTag = (field: keyof Pick<VCThesis, 'stage' | 'sectors' | 'geography'>, value: string, setValue: (v: string) => void) => {
    if (value.trim() && !thesis[field].includes(value.trim())) {
      setThesis({
        ...thesis,
        [field]: [...thesis[field], value.trim()],
      });
      setValue('');
    }
  };

  const removeTag = (field: keyof Pick<VCThesis, 'stage' | 'sectors' | 'geography'>, value: string) => {
    setThesis({
      ...thesis,
      [field]: thesis[field].filter(item => item !== value),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: keyof Pick<VCThesis, 'stage' | 'sectors' | 'geography'>, value: string, setValue: (v: string) => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(field, value, setValue);
    }
  };

  // Pre-defined options
  const stageOptions = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'];
  const sectorOptions = ['SaaS', 'Fintech', 'Healthcare', 'AI/ML', 'E-commerce', 'Climate Tech', 'EdTech', 'PropTech', 'DeepTech', 'Consumer'];
  const geoOptions = ['North America', 'Europe', 'Asia', 'Latin America', 'Middle East', 'Africa', 'Global'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="p-6">
        <h2 className="mb-2">Investment Thesis & Criteria</h2>
        <p className="text-muted-foreground mb-6">
          Define your investment criteria so AI can screen applications that match your thesis
        </p>

        <div className="space-y-6">
          {/* Stage */}
          <div>
            <Label className="mb-2 block">Investment Stage</Label>
            <p className="text-sm text-muted-foreground mb-3">Select or add stages you invest in</p>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {stageOptions.map(stage => (
                <Badge
                  key={stage}
                  variant={thesis.stage.includes(stage) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => {
                    if (thesis.stage.includes(stage)) {
                      removeTag('stage', stage);
                    } else {
                      addTag('stage', stage, () => {});
                    }
                  }}
                >
                  {stage}
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={stageInput}
                onChange={(e) => setStageInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'stage', stageInput, setStageInput)}
                placeholder="Add custom stage..."
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag('stage', stageInput, setStageInput)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            {thesis.stage.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {thesis.stage.map(stage => (
                  <Badge key={stage} variant="secondary" className="gap-1">
                    {stage}
                    <X
                      className="size-3 cursor-pointer"
                      onClick={() => removeTag('stage', stage)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Sectors */}
          <div>
            <Label className="mb-2 block">Sectors & Industries</Label>
            <p className="text-sm text-muted-foreground mb-3">Select or add sectors you focus on</p>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {sectorOptions.map(sector => (
                <Badge
                  key={sector}
                  variant={thesis.sectors.includes(sector) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => {
                    if (thesis.sectors.includes(sector)) {
                      removeTag('sectors', sector);
                    } else {
                      addTag('sectors', sector, () => {});
                    }
                  }}
                >
                  {sector}
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={sectorInput}
                onChange={(e) => setSectorInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'sectors', sectorInput, setSectorInput)}
                placeholder="Add custom sector..."
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag('sectors', sectorInput, setSectorInput)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            {thesis.sectors.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {thesis.sectors.map(sector => (
                  <Badge key={sector} variant="secondary" className="gap-1">
                    {sector}
                    <X
                      className="size-3 cursor-pointer"
                      onClick={() => removeTag('sectors', sector)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Geography */}
          <div>
            <Label className="mb-2 block">Geography</Label>
            <p className="text-sm text-muted-foreground mb-3">Select or add regions you invest in</p>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {geoOptions.map(geo => (
                <Badge
                  key={geo}
                  variant={thesis.geography.includes(geo) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => {
                    if (thesis.geography.includes(geo)) {
                      removeTag('geography', geo);
                    } else {
                      addTag('geography', geo, () => {});
                    }
                  }}
                >
                  {geo}
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={geoInput}
                onChange={(e) => setGeoInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'geography', geoInput, setGeoInput)}
                placeholder="Add custom region..."
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addTag('geography', geoInput, setGeoInput)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            {thesis.geography.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {thesis.geography.map(geo => (
                  <Badge key={geo} variant="secondary" className="gap-1">
                    {geo}
                    <X
                      className="size-3 cursor-pointer"
                      onClick={() => removeTag('geography', geo)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Revenue Range */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Minimum Annual Revenue (optional)</Label>
              <Input
                value={thesis.minRevenue || ''}
                onChange={(e) => setThesis({ ...thesis, minRevenue: e.target.value })}
                placeholder="e.g., $1M ARR"
              />
            </div>
            <div>
              <Label>Maximum Annual Revenue (optional)</Label>
              <Input
                value={thesis.maxRevenue || ''}
                onChange={(e) => setThesis({ ...thesis, maxRevenue: e.target.value })}
                placeholder="e.g., $10M ARR"
              />
            </div>
          </div>

          {/* Custom Criteria */}
          <div>
            <Label>Custom Screening Criteria</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Describe additional criteria, deal-breakers, or specific characteristics you look for
            </p>
            <Textarea
              value={thesis.customCriteria}
              onChange={(e) => setThesis({ ...thesis, customCriteria: e.target.value })}
              placeholder="Example: We look for companies with strong founder-market fit, proven traction in their niche, and a clear path to $100M+ revenue. We avoid hardware-focused businesses and marketplaces without network effects..."
              rows={6}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-3">
          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
            <span className="text-lg">🤖</span>
          </div>
          <div>
            <h3 className="mb-1">How AI Uses Your Thesis</h3>
            <p className="text-sm text-muted-foreground">
              ScreenVC's AI will analyze each application against these criteria, conduct market research on the sector, 
              evaluate competitive positioning, and provide a detailed assessment of whether the opportunity matches your thesis. 
              This saves you hours of manual research and helps you focus only on high-potential deals.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSaveCriteria} disabled={!onSaveCriteria || isSavingCriteria}>
          {isSavingCriteria ? 'Saving...' : 'Save Criteria'}
        </Button>
      </div>
    </div>
  );
}
