import { User, ExternalLink } from "lucide-react";
import LinkedInIcon from "../shared/LinkedInIcon";

const roleBadgeStyles = {
  chair: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  member: "border-blue-500/25 bg-blue-500/10 text-blue-400",
  observer: "border-zinc-500/25 bg-zinc-500/10 text-zinc-400",
  advisor: "border-purple-500/25 bg-purple-500/10 text-purple-400",
};

function getRoleBadgeKey(role, type) {
  if (!role && !type) return null;
  const lower = (role || "").toLowerCase();
  if (lower.includes("chair")) return "chair";
  if (lower.includes("observer")) return "observer";
  if (type === "advisor" || lower.includes("advisor")) return "advisor";
  return "member";
}

export default function BoardCard({ member, type = "board" }) {
  if (!member) return null;

  const {
    name,
    role,
    organization,
    background,
    expertise,
    linkedin_url,
    source_url,
  } = member;

  const badgeKey = getRoleBadgeKey(role, type);
  const badgeStyle = badgeKey ? roleBadgeStyles[badgeKey] : null;
  const badgeLabel = role || (type === "advisor" ? "Advisor" : "Member");

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4 hover-glow transition-all animate-init animate-fade-in-up">
      {/* Avatar */}
      <div className="rounded-full bg-gradient-to-br from-blue-500/12 to-purple-500/8 p-2.5 shrink-0">
        <User className="h-4 w-4 text-blue-400" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Name row with links */}
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
            {name || "Unknown"}
          </p>
          {linkedin_url && (
            <a
              href={linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--muted-foreground))] hover:text-[#0A66C2] transition-colors shrink-0 cursor-pointer"
              aria-label={`${name} LinkedIn`}
            >
              <LinkedInIcon className="h-3.5 w-3.5" />
            </a>
          )}
          {source_url && (
            <a
              href={source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors shrink-0 cursor-pointer"
              title="View source"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Organization */}
        {organization && (
          <p className="text-xs text-[hsl(var(--primary))]">{organization}</p>
        )}

        {/* Role badge */}
        {badgeStyle && (
          <span
            className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${badgeStyle}`}
          >
            {badgeLabel}
          </span>
        )}

        {/* Expertise badge (for advisors) */}
        {expertise && (
          <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border border-cyan-500/25 bg-cyan-500/5 text-cyan-400 mt-1">
            {expertise}
          </span>
        )}

        {/* Background / career history */}
        {background && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed mt-1">
            {background}
          </p>
        )}
      </div>
    </div>
  );
}
