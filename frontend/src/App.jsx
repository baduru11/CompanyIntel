import { useState, useCallback, useMemo, useEffect, Component } from "react";

// Layout
import TopBar from "./components/layout/TopBar";
import ProgressBar from "./components/layout/ProgressBar";
import StepIndicator from "./components/layout/StepIndicator";
import AgentLog from "./components/layout/AgentLog";
import SuggestionPanel from "./components/layout/SuggestionPanel";

// Views
import HistoryGrid from "./components/history/HistoryGrid";
import ExploreView from "./components/explore/ExploreView";
import DeepDiveView from "./components/deep-dive/DeepDiveView";

// Hooks
import { useAgentQuery } from "./hooks/useAgentQuery";
import { fetchReport } from "./lib/api";
import { exportReportPdf } from "./lib/exportPdf";

const NODE_TO_STEP = {
  validation: 1,
  planner: 2,
  searcher: 3,
  profiler: 4,
  synthesis: 5,
  critic: 6,
};

function deriveCurrentStep(events) {
  if (!events || events.length === 0) return 0;
  let maxStep = 0;
  for (const evt of events) {
    const node = (evt.node || evt.step || "").toLowerCase();
    const step = NODE_TO_STEP[node];
    if (step && step > maxStep) {
      maxStep = step;
    }
  }
  return maxStep;
}

// ---------------------------------------------------------------------------
// URL helpers — sync view state to search params
// ---------------------------------------------------------------------------
function readViewFromURL() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view"); // "explore" | "deep_dive" | null
  const q = params.get("q") || "";
  const mode = params.get("mode") || view || "";
  if (view === "explore" || view === "deep_dive") {
    return { view, query: q, mode };
  }
  return { view: "history", query: "", mode: "" };
}

function pushViewToURL(view, query, mode) {
  const params = new URLSearchParams();
  if (view && view !== "history") {
    params.set("view", view);
    if (query) params.set("q", query);
    if (mode) params.set("mode", mode);
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({}, "", url);
  } else {
    window.history.pushState({}, "", window.location.pathname);
  }
}

// ---------------------------------------------------------------------------
// Error Boundary — catches rendering crashes in views
// ---------------------------------------------------------------------------
class ViewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ViewErrorBoundary] Caught rendering error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full animate-fade-in">
          <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <span className="text-red-400 text-xl">!</span>
            </div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              Something went wrong rendering this view
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] max-h-24 overflow-auto font-mono">
              {this.state.error?.message || "Unknown error"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset?.();
              }}
              className="mt-2 px-4 py-2 text-sm rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity cursor-pointer"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Informative loading state shown while the agent pipeline is running.
 */
function QueryLoading({ mode, currentStep }) {
  const stepMessages = [
    "Validating your query...",
    "Planning research strategy...",
    "Searching across data sources...",
    "Building company profiles...",
    "Synthesizing findings...",
    "Running quality checks...",
  ];
  const message = stepMessages[Math.max(0, currentStep - 1)] || "Preparing analysis...";
  const isDeepDive = mode === "deep_dive";

  return (
    <div className="flex flex-col items-center justify-center h-full animate-fade-in">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        {/* Animated rings */}
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" style={{ animationDuration: '2s' }} />
          <div className="absolute inset-2 rounded-full border-2 border-blue-500/30 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center">
              <span className="text-blue-400 text-lg font-bold">{currentStep || "?"}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">
            {isDeepDive ? "Generating Deep Dive Report" : "Exploring Market Landscape"}
          </p>
          <p className="text-sm text-blue-400 animate-pulse-soft">
            {message}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            This typically takes 30-90 seconds
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  // Read initial view from URL so refresh/bookmarks restore state
  const initialURL = useMemo(() => readViewFromURL(), []);
  const [currentView, setCurrentView] = useState(initialURL.view);
  const [queryResult, setQueryResult] = useState(null);
  const [agentLogOpen, setAgentLogOpen] = useState(false);

  const {
    query: activeQuery,
    result,
    error,
    isLoading,
    events,
    submit,
    cancel,
    suggestions,
    suggestionsLoading,
    confirmQuery,
    dismissSuggestions,
  } = useAgentQuery();
  const [selectedQuery, setSelectedQuery] = useState(null);
  const currentStep = useMemo(() => deriveCurrentStep(events), [events]);

  // Sync result from hook → local queryResult
  useEffect(() => {
    if (result) {
      setQueryResult(result);
    }
  }, [result]);

  // On mount: if URL says explore/deep_dive, restore last result from localStorage
  // and re-trigger the query if no cached result exists
  useEffect(() => {
    if (initialURL.view !== "history" && initialURL.query) {
      // Try to load from localStorage (the hook already does this)
      if (result) {
        setQueryResult(result);
      } else {
        // No cached result — trigger the pipeline
        submit(initialURL.query, initialURL.mode || initialURL.view);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const { view, query, mode } = readViewFromURL();
      setCurrentView(view);
      if (view === "history") {
        setQueryResult(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleSubmit = useCallback(
    (query, mode) => {
      const view = mode === "deep_dive" ? "deep_dive" : "explore";
      setCurrentView(view);
      setQueryResult(null);
      setAgentLogOpen(false);
      pushViewToURL(view, query, mode);
      submit(query, mode);
    },
    [submit]
  );

  const handleSelectSuggestion = useCallback(
    (selected) => {
      setSelectedQuery(selected);
      const view = suggestions?.mode === "deep_dive" ? "deep_dive" : "explore";
      setCurrentView(view);
      setQueryResult(null);
      pushViewToURL(view, selected, suggestions?.mode || "explore");
      confirmQuery(selected);
    },
    [confirmQuery, suggestions]
  );

  const handleDismissSuggestions = useCallback(() => {
    dismissSuggestions();
  }, [dismissSuggestions]);

  const handleCancel = useCallback(() => {
    cancel();
    setCurrentView("history");
    setQueryResult(null);
    setSelectedQuery(null);
    pushViewToURL("history", "", "");
  }, [cancel]);

  const handleLogoClick = useCallback(() => {
    setCurrentView("history");
    setQueryResult(null);
    setSelectedQuery(null);
    pushViewToURL("history", "", "");
  }, []);

  const handleSelectReport = useCallback(async (report) => {
    const mode = report.mode || "explore";
    const view = mode === "deep_dive" ? "deep_dive" : "explore";
    try {
      const fullReport = await fetchReport(report.filename);
      setQueryResult(fullReport);
      setCurrentView(view);
      pushViewToURL(view, report.query, mode);
    } catch {
      setCurrentView(view);
      setQueryResult(null);
      pushViewToURL(view, report.query, mode);
      submit(report.query, mode);
    }
  }, [submit]);

  const handleDeepDive = useCallback(
    (company) => {
      const companyName = company?.name || company?.query || "";
      if (!companyName) return;
      setCurrentView("deep_dive");
      setQueryResult(null);
      pushViewToURL("deep_dive", companyName, "deep_dive");
      submit(companyName, "deep_dive");
    },
    [submit]
  );

  const handleDownloadPdf = useCallback(() => {
    if (!queryResult) return;
    exportReportPdf(queryResult);
  }, [queryResult]);

  const handleErrorReset = useCallback(() => {
    setCurrentView("history");
    setQueryResult(null);
    pushViewToURL("history", "", "");
  }, []);

  return (
    <div className="h-screen bg-[hsl(var(--background))] flex flex-col overflow-hidden">
      {/* Progress bar */}
      <ProgressBar currentStep={currentStep} isActive={isLoading} />

      {/* Top bar */}
      <TopBar
        onSubmit={handleSubmit}
        isLoading={isLoading || suggestionsLoading}
        onLogoClick={handleLogoClick}
        onCancel={handleCancel}
        externalQuery={selectedQuery}
      />

      {/* Suggestion panel */}
      <SuggestionPanel
        suggestions={suggestions?.suggestions}
        originalQuery={suggestions?.original_query}
        mode={suggestions?.mode}
        onSelect={handleSelectSuggestion}
        onDismiss={handleDismissSuggestions}
        isLoading={suggestionsLoading}
      />

      {/* Step indicator — visible during loading */}
      {isLoading && <StepIndicator currentStep={currentStep} />}

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2.5 bg-red-500/10 border-b border-red-500/20 animate-fade-in">
          <p className="text-sm text-red-400 text-center flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
            {error}
          </p>
        </div>
      )}

      {/* Main content area */}
      <main className="flex-1 overflow-hidden">
        {currentView === "history" && (
          <div className="h-full animate-fade-in">
            <HistoryGrid onSelectReport={handleSelectReport} />
          </div>
        )}

        {currentView === "explore" && (
          <div className="h-full">
            {isLoading && !queryResult ? (
              <QueryLoading mode="explore" currentStep={currentStep} />
            ) : queryResult ? (
              <ViewErrorBoundary key="explore" onReset={handleErrorReset}>
                <div className="h-full animate-fade-in">
                  <ExploreView data={queryResult} onDeepDive={handleDeepDive} />
                </div>
              </ViewErrorBoundary>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full animate-fade-in">
                <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                    <span className="text-red-400 text-xl">!</span>
                  </div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">Something went wrong</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
                  <button
                    onClick={() => activeQuery && handleSubmit(activeQuery, "explore")}
                    className="mt-2 px-4 py-2 text-sm rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {currentView === "deep_dive" && (
          <div className="h-full">
            {isLoading && !queryResult ? (
              <QueryLoading mode="deep_dive" currentStep={currentStep} />
            ) : queryResult ? (
              <ViewErrorBoundary key="deep_dive" onReset={handleErrorReset}>
                <div className="h-full animate-fade-in">
                  <DeepDiveView
                    data={queryResult}
                    onDownloadPdf={handleDownloadPdf}
                  />
                </div>
              </ViewErrorBoundary>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full animate-fade-in">
                <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                    <span className="text-red-400 text-xl">!</span>
                  </div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">Something went wrong</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
                  <button
                    onClick={() => activeQuery && handleSubmit(activeQuery, "deep_dive")}
                    className="mt-2 px-4 py-2 text-sm rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* Agent log */}
      <AgentLog
        events={events}
        isActive={isLoading}
        isOpen={agentLogOpen}
        onToggle={() => setAgentLogOpen((prev) => !prev)}
      />
    </div>
  );
}

export default App;
