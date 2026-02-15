import { Button } from './ui/button';
import { CheckCircle2, Sparkles, Zap, TrendingUp, Filter, Brain } from 'lucide-react';
import { Card } from './ui/card';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="w-full">
      {/* Navigation */}
      <nav className=" bg-primary backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between bg-[#00000000]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl font-semibold">ScreenVC</span>
          </div>
          <Button onClick={onGetStarted} className="bg-black text-white font-semibold hover:bg-black hover:text-white hover:scale-105 transition-transform">Get Started</Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-primary mx-auto px-6 py-20 md:py-28">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10 mb-6">
            <Brain className="size-4 text-primary" />
            <Sparkles className="size-6 text-black" />
            <span className="text-sm font-bold">AI-Powered Deal Screening</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Stop Wasting Time on<br />
            <span className="font-bold">Low-Quality Deals</span>
          </h1>
          
          <p className="text-black font-semibold mb-8 max-w-2xl mx-auto">
            Screen startup applications, conduct deep market research on investment opportunities, and surface only the opportunities that match your thesis so you can focus on what matters
          </p>
          
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Button size="lg" onClick={onGetStarted} className="px-8 bg-black text-white font-semibold hover:bg-black hover:text-white hover:scale-105 transition-transform">Create Your Form</Button>
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="bg-muted/30 py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">The Problem</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              VCs face a broken screening process that wastes time and misses opportunities
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6 bg-background">
              <div className="size-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
                <span className="text-2xl">⏱️</span>
              </div>
              <h3 className="mb-2">Time Drain</h3>
              <p className="text-muted-foreground">VCs spend hours reviewing decks, but only 2% are high-value opportunities</p>
            </Card>
            
            <Card className="p-6 bg-background">
              <div className="size-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
                <span className="text-2xl">📭</span>
              </div>
              <h3 className="mb-2">No Feedback Loop</h3>
              <p className="text-muted-foreground">Founders get no feedback due to high application volumes</p>
            </Card>
            
            <Card className="p-6 bg-background">
              <div className="size-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
                <span className="text-2xl">🎯</span>
              </div>
              <h3 className="mb-2">Missed Opportunities</h3>
              <p className="text-muted-foreground">Surface-level screening causes VCs to miss high-potential startups</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">The Solution</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              AI-powered first-layer screening that does the heavy lifting for you
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="flex gap-4">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Filter className="size-5 text-primary" />
              </div>
              <div>
                <h3 className="mb-2">Smart Screening</h3>
                <p className="text-muted-foreground">AI analyzes all founder-provided information against your specific investment thesis and criteria</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="size-5 text-primary" />
              </div>
              <div>
                <h3 className="mb-2">Market Research</h3>
                <p className="text-muted-foreground">Automatic competitive analysis and market assessment for each application</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Zap className="size-5 text-primary" />
              </div>
              <div>
                <h3 className="mb-2">Time Savings</h3>
                <p className="text-muted-foreground">Focus only on high-value opportunities that fit your thesis perfectly</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Brain className="size-5 text-primary" />
              </div>
              <div>
                <h3 className="mb-2">Better Decisions</h3>
                <p className="text-muted-foreground">More information depth leads to better-informed investment decisions</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why It Matters */}
      <section className="bg-primary text-primary-foreground py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Why It Matters</h2>
          <p className="text-xl mb-8 opacity-90">
            We're not just making the process faster—we're fixing the structural failure of how capital is allocated in high-risk, high-reward opportunities.
          </p>
          <div className="grid md:grid-cols-2 gap-6 text-left">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-6 flex-shrink-0 mt-1" />
              <div>
                <p className="opacity-90">VCs stop wasting time on irrelevant startups</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-6 flex-shrink-0 mt-1" />
              <div>
                <p className="opacity-90">More reliable and efficient funding process</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-6 flex-shrink-0 mt-1" />
              <div>
                <p className="opacity-90">AI replaces first-pass venture judgment</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-6 flex-shrink-0 mt-1" />
              <div>
                <p className="opacity-90">Focus strictly on high-value opportunities</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Set up your AI-powered application form in three simple steps
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="size-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                1
              </div>
              <h3 className="mb-2">Create Your Form</h3>
              <p className="text-muted-foreground">Add custom questions to gather the information you need from founders</p>
            </div>
            
            <div className="text-center">
              <div className="size-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                2
              </div>
              <h3 className="mb-2">Define Your Thesis</h3>
              <p className="text-muted-foreground">Set your investment criteria and screening filters based on your VC thesis</p>
            </div>
            
            <div className="text-center">
              <div className="size-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                3
              </div>
              <h3 className="mb-2">Embed & Screen</h3>
              <p className="text-muted-foreground">Place the form on your website and let AI screen applications automatically</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Transform Your Deal Flow?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Start screening smarter with ScreenVC today
          </p>
          <Button size="lg" onClick={onGetStarted} className="px-8">
            Create Your First Form
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-muted-foreground">
          <p>&copy; 2026 ScreenVC. Making capital allocation smarter.</p>
        </div>
      </footer>
    </div>
  );
}