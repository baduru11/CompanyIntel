import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react";
import {
  Building2,
  Calendar,
  MapPin,
  Users,
  Layers,
  Download,
  User,
  AlertTriangle,
  ExternalLink,
  TrendingUp,
  DollarSign,
  Shield,
  Target,
  BarChart3,
  LayoutDashboard,
  Lightbulb,
  ShieldAlert,
  Activity,
  Briefcase,
  FileText,
} from "lucide-react";
import { Button } from "../ui/button";
import ReportSection from "./ReportSection";
import FundingChart from "./FundingChart";
import NewsCard from "./NewsCard";
import CompetitorTable from "./CompetitorTable";
import RedFlagCard from "./RedFlagCard";
import MarkdownProse from "../shared/MarkdownProse";
import InvestmentScoreCard from "./InvestmentScoreCard";
import RevenueCard from "./RevenueCard";
import BoardCard from "./BoardCard";
import PatentTable from "./PatentTable";
import EmployeeChart from "./EmployeeChart";
import PartnershipCard from "./PartnershipCard";
import AcquisitionCard from "./AcquisitionCard";
import LinkedInIcon from "../shared/LinkedInIcon";
import { ChatPanel } from "../chat/ChatPanel";

/* ── helpers ─────────────────────────────────────────────────── */

function getSectionConfidence(data, sectionKey) {
  const critic = data?.critic || data?.critic_report;
  const keyMap = {
    people: "key_people",
    product: "product_technology",
    news: "recent_news",
    market: "market_opportunity",
    businessModel: "business_model",
    competitiveAdvantages: "competitive_advantages",
    governance: "governance",
  };
  const criticKey = keyMap[sectionKey] || sectionKey;
  if (critic?.section_scores?.[criticKey] != null) {
    return critic.section_scores[criticKey];
  }
  const report = data?.report || data || {};
  const fieldMap = {
    overview: "overview",
    funding: "funding",
    people: "key_people",
    product: "product_technology",
    news: "recent_news",
    competitors: "competitors",
    red_flags: "red_flags",
    market: "market_opportunity",
    businessModel: "business_model",
    competitiveAdvantages: "competitive_advantages",
    traction: "traction",
    risks: "risks",
    governance: "governance",
  };
  const field = fieldMap[sectionKey];
  if (field && report[field]?.confidence != null) {
    return report[field].confidence;
  }
  return data?.confidence ?? data?.report?.confidence ?? null;
}

function getSectionSources(data, sectionKey) {
  const report = data?.report || data || {};
  const fieldMap = {
    overview: "overview",
    funding: "funding",
    people: "key_people",
    product: "product_technology",
    news: "recent_news",
    competitors: "competitors",
    red_flags: "red_flags",
    market: "market_opportunity",
    businessModel: "business_model",
    competitiveAdvantages: "competitive_advantages",
    traction: "traction",
    risks: "risks",
    governance: "governance",
  };
  const field = fieldMap[sectionKey];
  const section = field ? report[field] : null;
  if (section?.source_urls?.length) {
    return section.source_urls.map((s) =>
      typeof s === "string" ? { url: s } : s
    );
  }
  return [];
}

const textOf = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v.content) return v.content;
  return "";
};

/* ── sub-components ──────────────────────────────────────────── */

function MetricCard({ icon: Icon, label, value, color = "blue" }) {
  const colorMap = {
    blue: "from-blue-500/12 to-blue-600/5 text-blue-400",
    green: "from-emerald-500/12 to-emerald-600/5 text-emerald-400",
    purple: "from-purple-500/12 to-purple-600/5 text-purple-400",
    amber: "from-amber-500/12 to-amber-600/5 text-amber-400",
    cyan: "from-cyan-500/12 to-cyan-600/5 text-cyan-400",
    rose: "from-rose-500/12 to-rose-600/5 text-rose-400",
  };
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-2 hover-glow transition-all cursor-default">
      <div
        className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${colorMap[color]}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className="text-sm font-semibold text-[hsl(var(--foreground))] mt-0.5">
          {value}
        </p>
      </div>
    </div>
  );
}

function CrunchbaseIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.394 17.505c-.707.707-1.553 1.262-2.51 1.65a7.802 7.802 0 01-3.084.615 7.766 7.766 0 01-3.077-.615 7.931 7.931 0 01-2.51-1.65 7.84 7.84 0 01-1.693-2.51A7.694 7.694 0 013.9 12a7.76 7.76 0 01.62-3.077 8.04 8.04 0 011.693-2.51A7.84 7.84 0 018.723 4.72a7.76 7.76 0 013.077-.62c1.08 0 2.112.208 3.084.615a7.932 7.932 0 012.51 1.693 7.84 7.84 0 011.693 2.51c.407.972.615 2.004.615 3.082a7.694 7.694 0 01-.615 2.995 8.04 8.04 0 01-1.693 2.51z" />
    </svg>
  );
}

/** Person card reused in Team section */
function PersonCard({ person, index }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4 hover-glow transition-all animate-init animate-fade-in-up"
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      <div className="rounded-full bg-gradient-to-br from-blue-500/12 to-purple-500/8 p-2.5">
        <User className="h-4 w-4 text-blue-400" />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
            {person.name || "Unknown"}
          </p>
          {person.linkedin_url && (
            <a
              href={person.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--muted-foreground))] hover:text-[#0A66C2] transition-colors shrink-0 cursor-pointer"
              aria-label={`${person.name} LinkedIn`}
            >
              <LinkedInIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        {(person.title || person.role) && (
          <p className="text-xs text-[hsl(var(--primary))]">
            {person.title || person.role}
          </p>
        )}
        {person.background && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed mt-1">
            {person.background}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {person.prior_exits?.length > 0 && (
            <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border border-emerald-500/25 bg-emerald-500/5 text-emerald-400">
              {person.prior_exits.length} exit
              {person.prior_exits.length > 1 ? "s" : ""}
            </span>
          )}
          {person.domain_expertise_years && (
            <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border border-blue-500/25 bg-blue-500/5 text-blue-400">
              {person.domain_expertise_years}+ yrs domain exp.
            </span>
          )}
          {person.notable_affiliations?.length > 0 && (
            <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border border-purple-500/25 bg-purple-500/5 text-purple-400 truncate max-w-[200px]">
              {person.notable_affiliations[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── severity / risk styling ─────────────────────────────────── */

const severityColor = {
  low: "border-yellow-500/25 bg-yellow-500/5 text-yellow-400",
  medium: "border-amber-500/25 bg-amber-500/5 text-amber-400",
  high: "border-red-500/25 bg-red-500/5 text-red-400",
};

const riskCategoryIcon = {
  regulatory: Shield,
  market: TrendingUp,
  technology: Target,
  team: Users,
  financial: DollarSign,
  competitive: BarChart3,
};

/* ── sidebar nav definitions ─────────────────────────────────── */

const NAV_DEFS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "financials", label: "Financials", icon: DollarSign },
  { id: "team", label: "Team", icon: Users },
  { id: "product-market", label: "Product & Market", icon: Lightbulb },
  { id: "traction", label: "Traction", icon: TrendingUp },
  { id: "risk", label: "Risk", icon: ShieldAlert },
];

/* ── scroll-spy hook ─────────────────────────────────────────── */

function useScrollSpy(scrollRef, sectionIds) {
  const [activeId, setActiveId] = useState(sectionIds[0]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the first visible section from top
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        root: container,
        rootMargin: "-10% 0px -60% 0px",
        threshold: 0,
      }
    );

    for (const id of sectionIds) {
      const el = container.querySelector(`#${CSS.escape(id)}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [scrollRef, sectionIds]);

  return activeId;
}

/* ── main component ──────────────────────────────────────────── */

export default function DeepDiveView({ data, onDownloadPdf }) {
  const [chatOpen, setChatOpen] = useState(false);
  const scrollRef = useRef(null);

  const sectionIds = useMemo(() => NAV_DEFS.map((n) => n.id), []);
  const activeSection = useScrollSpy(scrollRef, sectionIds);

  const report = data?.report || data || {};
  const critic = data?.critic || data?.critic_report || {};
  const reportId = data?.report_id || "";

  const overviewSection = report.overview || {};
  const isOverviewSection =
    typeof overviewSection === "object" && overviewSection.content;
  const company = isOverviewSection ? {} : report.company || overviewSection;
  const companyName =
    report.company_name || company.name || report.name || "Company";

  /* ── extract all data ──────────────────────────────────────── */

  const description = textOf(report.overview) || company.description || "";
  const fundingRounds =
    report.funding_rounds ||
    (Array.isArray(report.funding) ? report.funding : report.funding?.rounds) ||
    [];
  const fundingText = textOf(report.funding) || "";
  const people = report.people_entries?.length
    ? report.people_entries
    : Array.isArray(report.key_people)
    ? report.key_people
    : [];
  const peopleText = textOf(report.key_people) || "";
  const productText = textOf(report.product_technology) || "";
  const newsItems = (report.news_items || [])
    .slice()
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date) - new Date(a.date);
    });
  const newsText = textOf(report.recent_news) || "";
  const competitors = report.competitor_entries || [];
  const competitorsText = textOf(report.competitors) || "";
  const redFlags = report.red_flag_entries?.length
    ? report.red_flag_entries
    : [];
  const redFlagsText = textOf(report.red_flags) || "";
  const riskEntries = report.risk_entries || [];
  const risksText = textOf(report.risks) || "";

  // New data
  const investmentScore = report.investment_score;
  const revenueEstimate = report.revenue_estimate;
  const boardMembers = report.board_members || [];
  const advisors = report.advisors || [];
  const partnerships = report.partnerships || [];
  const keyCustomers = report.key_customers || [];
  const acquisitions = report.acquisitions || [];
  const patents = report.patents || [];
  const employeeHistory = report.employee_count_history || [];
  const operatingStatus = report.operating_status || "Active";
  const totalFunding = report.total_funding;

  // Section availability
  const hasMarket = report.market_opportunity?.content;
  const hasBusinessModel = report.business_model?.content;
  const hasCompetitiveAdvantages = report.competitive_advantages?.content;
  const hasTraction = report.traction?.content;
  const hasRisks = report.risks?.content || riskEntries.length > 0;
  const hasGovernance = report.governance?.content;

  const linkedinUrl = report.linkedin_url;
  const crunchbaseUrl = report.crunchbase_url;

  const metrics = [
    { label: "Founded", value: report.founded || "\u2014", icon: Calendar, color: "blue" },
    { label: "HQ", value: report.headquarters || "\u2014", icon: MapPin, color: "green" },
    { label: "Employees", value: report.headcount || "\u2014", icon: Users, color: "purple" },
    { label: "Stage", value: report.funding_stage || "\u2014", icon: Layers, color: "amber" },
    { label: "Status", value: operatingStatus, icon: Activity, color: "cyan" },
    { label: "Total Raised", value: totalFunding || "\u2014", icon: DollarSign, color: "rose" },
  ];

  const handlePdf = useCallback(() => onDownloadPdf?.(), [onDownloadPdf]);

  const scrollToSection = useCallback((id) => {
    const el = scrollRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* ── render ────────────────────────────────────────────────── */

  const [logoState, setLogoState] = useState(report.logo_url ? "loading" : "fallback");
  const logoSrc = useRef(report.logo_url);

  // Reset logo state when report changes
  useLayoutEffect(() => {
    if (report.logo_url) {
      logoSrc.current = report.logo_url;
      setLogoState("loading");
    } else {
      setLogoState("fallback");
    }
  }, [report.logo_url]);

  const handleLogoError = useCallback((e) => {
    if (logoSrc.current?.includes("clearbit")) {
      try {
        const domain = new URL(logoSrc.current).pathname.slice(1);
        logoSrc.current = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        e.target.src = logoSrc.current;
      } catch {
        setLogoState("fallback");
      }
    } else {
      setLogoState("fallback");
    }
  }, []);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 z-20 flex items-center justify-between px-6 py-3.5 bg-[hsl(var(--background))]/80 backdrop-blur-md border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-3">
          {logoState !== "fallback" ? (
            <img
              src={logoSrc.current}
              alt={`${companyName} logo`}
              className="w-9 h-9 rounded-xl border border-[hsl(var(--border))] object-contain bg-white"
              onLoad={() => setLogoState("loaded")}
              onError={handleLogoError}
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-600/5 flex items-center justify-center border border-blue-500/20">
              <Building2 className="w-4 h-4 text-blue-400" />
            </div>
          )}
          <h1 className="text-xl font-bold text-[hsl(var(--foreground))] truncate">
            {companyName}
          </h1>
          <div className="flex items-center gap-1.5 ml-1">
            {linkedinUrl && (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[#0A66C2] hover:bg-[#0A66C2]/10 transition-colors cursor-pointer"
                title="LinkedIn"
              >
                <LinkedInIcon className="h-4 w-4" />
              </a>
            )}
            {crunchbaseUrl && (
              <a
                href={crunchbaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[#0288D1] hover:bg-[#0288D1]/10 transition-colors cursor-pointer"
                title="Crunchbase"
              >
                <CrunchbaseIcon className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
        {onDownloadPdf && (
          <Button
            variant="outline"
            size="sm"
            onClick={handlePdf}
            className="rounded-lg cursor-pointer"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        )}
      </div>

      {/* Body: sidebar + scrollable content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar nav — floating glass pill */}
        <div className="shrink-0 flex items-start pt-4 pl-3 pr-1">
          <nav
            className="sticky top-4 z-10 w-12 lg:w-[11rem] rounded-2xl py-2.5 px-1.5 lg:px-2.5 overflow-y-auto
              border border-white/[0.08]
              bg-[hsl(var(--card))]/60 backdrop-blur-xl
              shadow-xl shadow-black/20"
            aria-label="Report sections"
          >
            <ul className="flex flex-col gap-1">
              {NAV_DEFS.map(({ id, label, icon: NavIcon }) => {
                const isActive = activeSection === id;
                return (
                  <li key={id}>
                    <button
                      onClick={() => scrollToSection(id)}
                      aria-current={isActive ? "true" : undefined}
                      className={`group relative w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer ${
                        isActive
                          ? "text-white"
                          : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-white/[0.05]"
                      }`}
                    >
                      {/* Active pill background */}
                      {isActive && (
                        <span className="absolute inset-0 rounded-xl bg-[hsl(var(--primary))] shadow-[0_0_14px_hsl(var(--primary)/0.25)]" />
                      )}
                      {/* Active accent bar */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-white/80" />
                      )}
                      <NavIcon className="relative h-4 w-4 shrink-0" />
                      <span className="relative hidden lg:inline whitespace-nowrap">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth">
          <div className="p-6 space-y-10 max-w-5xl mx-auto">

            {/* ─── OVERVIEW ─────────────────────────────────────── */}
            <section id="overview">
              {/* Investment Score */}
              {investmentScore && (
                <div className="mb-6 animate-init animate-fade-in-up">
                  <InvestmentScoreCard score={investmentScore} />
                </div>
              )}

              {/* Overview prose */}
              <ReportSection
                title="Company Overview"
                confidence={getSectionConfidence(data, "overview")}
                sourceCount={report.overview?.source_count || 0}
                sourceUrls={getSectionSources(data, "overview")}
              >
                {description && (
                  <div className="mb-5">
                    <MarkdownProse
                      content={description}
                      citations={report.citations || []}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {metrics.map((m, i) => (
                    <div
                      key={m.label}
                      className="animate-init animate-fade-in-up"
                      style={{ animationDelay: `${i * 0.06}s` }}
                    >
                      <MetricCard
                        icon={m.icon}
                        label={m.label}
                        value={m.value}
                        color={m.color}
                      />
                    </div>
                  ))}
                </div>
              </ReportSection>
            </section>

            {/* ─── FINANCIALS ───────────────────────────────────── */}
            <section id="financials" className="space-y-6">
              {/* Revenue estimate */}
              {revenueEstimate && (
                <div className="animate-init animate-fade-in-up">
                  <RevenueCard revenue={revenueEstimate} />
                </div>
              )}

              {/* Funding */}
              <ReportSection
                title="Funding History"
                confidence={getSectionConfidence(data, "funding")}
                sourceCount={report.funding?.source_count || 0}
                sourceUrls={getSectionSources(data, "funding")}
              >
                {fundingText && (
                  <div className="mb-5">
                    <MarkdownProse
                      content={fundingText}
                      citations={report.citations || []}
                    />
                  </div>
                )}
                <FundingChart fundingRounds={fundingRounds} />
              </ReportSection>
            </section>

            {/* ─── TEAM ─────────────────────────────────────────── */}
            <section id="team" className="space-y-6">
              {/* Key Executives */}
              <ReportSection
                title="Key Executives"
                confidence={getSectionConfidence(data, "people")}
                sourceCount={report.key_people?.source_count || 0}
                sourceUrls={getSectionSources(data, "people")}
              >
                {people.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {people.map((person, i) => (
                      <PersonCard key={person.name || i} person={person} index={i} />
                    ))}
                  </div>
                ) : peopleText ? (
                  <MarkdownProse
                    content={peopleText}
                    citations={report.citations || []}
                  />
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    No key people data available.
                  </p>
                )}
              </ReportSection>

              {/* Board Members */}
              {boardMembers.length > 0 && (
                <ReportSection title="Board of Directors">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {boardMembers.map((member, i) => (
                      <div
                        key={member.name || i}
                        className="animate-init animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        <BoardCard member={member} type="board" />
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}

              {/* Advisors */}
              {advisors.length > 0 && (
                <ReportSection title="Advisors">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {advisors.map((advisor, i) => (
                      <div
                        key={advisor.name || i}
                        className="animate-init animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        <BoardCard member={advisor} type="advisor" />
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}

              {/* Governance prose */}
              {hasGovernance && (
                <ReportSection
                  title="Governance Analysis"
                  confidence={getSectionConfidence(data, "governance")}
                  sourceCount={report.governance?.source_count || 0}
                  sourceUrls={getSectionSources(data, "governance")}
                >
                  <MarkdownProse
                    content={textOf(report.governance)}
                    citations={report.citations || []}
                  />
                </ReportSection>
              )}
            </section>

            {/* ─── PRODUCT & MARKET ─────────────────────────────── */}
            <section id="product-market" className="space-y-6">
              {/* Product / Technology */}
              <ReportSection
                title="Product / Technology"
                confidence={getSectionConfidence(data, "product")}
                sourceCount={report.product_technology?.source_count || 0}
                sourceUrls={getSectionSources(data, "product")}
              >
                {productText ? (
                  <MarkdownProse
                    content={productText}
                    citations={report.citations || []}
                  />
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    No product/technology data available.
                  </p>
                )}
              </ReportSection>

              {/* Patents */}
              {patents.length > 0 && (
                <ReportSection title="Patent Portfolio">
                  <PatentTable patents={patents} />
                </ReportSection>
              )}

              {/* Market Opportunity */}
              {hasMarket && (
                <ReportSection
                  title="Market Opportunity"
                  confidence={getSectionConfidence(data, "market")}
                  sourceCount={report.market_opportunity?.source_count || 0}
                  sourceUrls={getSectionSources(data, "market")}
                >
                  <MarkdownProse
                    content={textOf(report.market_opportunity)}
                    citations={report.citations || []}
                  />
                </ReportSection>
              )}

              {/* Competitive Advantages */}
              {hasCompetitiveAdvantages && (
                <ReportSection
                  title="Competitive Advantages"
                  confidence={getSectionConfidence(data, "competitiveAdvantages")}
                  sourceCount={report.competitive_advantages?.source_count || 0}
                  sourceUrls={getSectionSources(data, "competitiveAdvantages")}
                >
                  <MarkdownProse
                    content={textOf(report.competitive_advantages)}
                    citations={report.citations || []}
                  />
                </ReportSection>
              )}

              {/* Business Model */}
              {hasBusinessModel && (
                <ReportSection
                  title="Business Model"
                  confidence={getSectionConfidence(data, "businessModel")}
                  sourceCount={report.business_model?.source_count || 0}
                  sourceUrls={getSectionSources(data, "businessModel")}
                >
                  <MarkdownProse
                    content={textOf(report.business_model)}
                    citations={report.citations || []}
                  />
                </ReportSection>
              )}
            </section>

            {/* ─── TRACTION ─────────────────────────────────────── */}
            <section id="traction" className="space-y-6">
              {/* Employee Growth */}
              {employeeHistory.length > 1 && (
                <ReportSection title="Employee Growth">
                  <EmployeeChart history={employeeHistory} />
                </ReportSection>
              )}

              {/* Partnerships */}
              {partnerships.length > 0 && (
                <ReportSection title="Key Partnerships">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {partnerships.map((p, i) => (
                      <div
                        key={p.partner_name || i}
                        className="animate-init animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        <PartnershipCard partnership={p} />
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}

              {/* Key Customers */}
              {keyCustomers.length > 0 && (
                <ReportSection title="Key Customers">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {keyCustomers.map((c, i) => (
                      <div
                        key={c.name || i}
                        className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4 hover-glow transition-all animate-init animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                          {c.name}
                        </p>
                        {c.description && (
                          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed">
                            {c.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}

              {/* Acquisitions */}
              {acquisitions.length > 0 && (
                <ReportSection title="Acquisitions">
                  <div className="space-y-3">
                    {acquisitions.map((a, i) => (
                      <div
                        key={a.acquired_company || i}
                        className="animate-init animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        <AcquisitionCard acquisition={a} />
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}

              {/* Traction prose */}
              {hasTraction && (
                <ReportSection
                  title="Traction Signals"
                  confidence={getSectionConfidence(data, "traction")}
                  sourceCount={report.traction?.source_count || 0}
                  sourceUrls={getSectionSources(data, "traction")}
                >
                  <MarkdownProse
                    content={textOf(report.traction)}
                    citations={report.citations || []}
                  />
                </ReportSection>
              )}

              {/* Recent News */}
              <ReportSection
                title="Recent News"
                confidence={getSectionConfidence(data, "news")}
                sourceCount={report.recent_news?.source_count || 0}
                sourceUrls={getSectionSources(data, "news")}
              >
                {newsItems.length > 0 ? (
                  <div className="space-y-3">
                    {newsItems.map((item, i) => (
                      <div
                        key={item.title || i}
                        className="animate-init animate-fade-in-up"
                        style={{ animationDelay: `${i * 0.06}s` }}
                      >
                        <NewsCard newsItem={item} />
                      </div>
                    ))}
                  </div>
                ) : newsText ? (
                  <MarkdownProse
                    content={newsText}
                    citations={report.citations || []}
                  />
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    No recent news available.
                  </p>
                )}
              </ReportSection>
            </section>

            {/* ─── RISK ─────────────────────────────────────────── */}
            <section id="risk" className="space-y-6">
              {/* Competitors */}
              <ReportSection
                title="Competitive Landscape"
                confidence={getSectionConfidence(data, "competitors")}
                sourceCount={report.competitors?.source_count || 0}
                sourceUrls={getSectionSources(data, "competitors")}
              >
                {competitorsText && (
                  <div className="mb-4">
                    <MarkdownProse
                      content={competitorsText}
                      citations={report.citations || []}
                    />
                  </div>
                )}
                {competitors.length > 0 ? (
                  <CompetitorTable competitors={competitors} />
                ) : !competitorsText ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    No competitor data available.
                  </p>
                ) : null}
              </ReportSection>

              {/* Red Flags */}
              <ReportSection
                title="Red Flags"
                confidence={getSectionConfidence(data, "red_flags")}
                sourceCount={report.red_flags?.source_count || 0}
                sourceUrls={getSectionSources(data, "red_flags")}
              >
                {redFlags.length > 0 ? (
                  <div className="space-y-3">
                    {redFlags.map((flag, i) => {
                      const flagText =
                        typeof flag === "string"
                          ? flag
                          : flag.content || flag.text || "";
                      const flagConf =
                        typeof flag === "object" ? flag.confidence : undefined;
                      const flagSources =
                        typeof flag === "object"
                          ? flag.sources || flag.source_urls || []
                          : [];
                      return (
                        <div
                          key={i}
                          className="animate-init animate-fade-in-up"
                          style={{ animationDelay: `${i * 0.06}s` }}
                        >
                          <RedFlagCard
                            content={flagText}
                            confidence={flagConf}
                            sourceUrls={flagSources.map((s) =>
                              typeof s === "string" ? { url: s } : s
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : redFlagsText ? (
                  <MarkdownProse
                    content={redFlagsText}
                    citations={report.citations || []}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-emerald-400/80">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    No red flags identified.
                  </div>
                )}
              </ReportSection>

              {/* Risk Entries */}
              {(hasRisks || riskEntries.length > 0) && (
                <ReportSection
                  title="Risk Assessment"
                  confidence={getSectionConfidence(data, "risks")}
                  sourceCount={report.risks?.source_count || 0}
                  sourceUrls={getSectionSources(data, "risks")}
                >
                  {risksText && (
                    <div className="mb-4">
                      <MarkdownProse
                        content={risksText}
                        citations={report.citations || []}
                      />
                    </div>
                  )}
                  {riskEntries.length > 0 && (
                    <div className="space-y-3">
                      {riskEntries.map((risk, i) => {
                        const RiskIcon =
                          riskCategoryIcon[risk.category] || AlertTriangle;
                        const colors =
                          severityColor[risk.severity] || severityColor.medium;
                        return (
                          <div
                            key={i}
                            className={`rounded-xl border p-4 ${colors} animate-init animate-fade-in-up`}
                            style={{ animationDelay: `${i * 0.06}s` }}
                          >
                            <div className="flex items-start gap-3">
                              <RiskIcon className="h-4 w-4 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                                    {risk.category}
                                  </span>
                                  <span className="text-[10px] opacity-60">
                                    {risk.severity} severity
                                  </span>
                                </div>
                                <p className="text-sm leading-relaxed">
                                  {risk.content}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ReportSection>
              )}
            </section>

            {/* Bottom spacer */}
            <div className="h-16" />
          </div>
        </div>
      </div>

      {/* Chat popup */}
      {reportId && (
        <ChatPanel
          reportId={reportId}
          companyName={companyName}
          isOpen={chatOpen}
          onToggle={() => setChatOpen((o) => !o)}
        />
      )}
    </div>
  );
}
