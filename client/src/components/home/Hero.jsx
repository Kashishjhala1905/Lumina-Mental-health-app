import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-8 py-20 md:py-32 overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-secondary/20 rounded-full blur-[100px] animate-pulse delay-1000" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center z-10">
        <div className="inline-flex items-center gap-2 bg-card border border-primary/20 rounded-full px-4 py-2 mb-8 animate-float">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium gradient-text">
            Welcome to Lumina
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
          Prioritize Your,{" "}
          <span className="gradient-text">Mental Wellbeing</span>
        </h1>

        <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
          Explore a modern mental health platform that combines AI support,
          expert counseling, helpful tools, and a positive community.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/chatbot">
            <Button size="lg" className="gap-2 w-full sm:w-auto">
              Start Chat <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link to="/resources">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Explore Resources
            </Button>
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div className="bg-card/50 backdrop-blur-sm rounded-xl p-6 border border-border hover:border-primary/50 transition-colors">
            <div className="text-3xl font-bold text-primary mb-2">24/7</div>
            <p className="text-sm text-muted-foreground">Support Available</p>
          </div>
          <div className="bg-card/50 backdrop-blur-sm rounded-xl p-6 border border-border hover:border-primary/50 transition-colors">
            <div className="text-3xl font-bold text-primary mb-2">100%</div>
            <p className="text-sm text-muted-foreground">Anonymous & Private</p>
          </div>
          <div className="bg-card/50 backdrop-blur-sm rounded-xl p-6 border border-border hover:border-primary/50 transition-colors">
            <div className="text-3xl font-bold text-primary mb-2">50K+</div>
            <p className="text-sm text-muted-foreground">Students Supported</p>
          </div>
        </div>
      </div>
    </section>
  );
}
