"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Globe, Linkedin, Mail, Twitter, Send, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ChatPanel from "@/components/ChatPanel";
import type { FundedLead, FundedStatus, EmailStatus, Contact } from "@/lib/types";
import { Button, Textarea } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import { SOURCE_LABELS } from "@/components/FundedCompanyCard";

const TYPE_COLORS: Record<string, string> = {
  "Consumer App":       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "DeFi / Protocol":    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "B2B Tooling":        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  "Infrastructure":     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Exchange / Trading": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

// Descriptions for each company category
const TYPE_DESCRIPTIONS: Record<string, string> = {
  "Consumer App":       "User-facing product targeting retail or everyday consumers.",
  "DeFi / Protocol":    "Decentralized finance or on-chain protocol infrastructure.",
  "B2B Tooling":        "Software or services sold to other businesses.",
  "Infrastructure":     "Core layer technology — nodes, RPCs, data, security.",
  "Exchange / Trading": "Crypto exchange, DEX, or trading platform.",
};

const OUTREACH_OPTIONS = [
  { value: "new",             label: "Not Sent",   color: "text-zinc-500 dark:text-zinc-400" },
  { value: "connection_sent", label: "Sent",       color: "text-violet-600 dark:text-violet-400" },
  { value: "connected",       label: "Connected",  color: "text-blue-600 dark:text-blue-400" },
  { value: "cant_find",       label: "Can't Find", color: "text-red-500 dark:text-red-400" },
];

const RESPONSE_OPTIONS = [
  { value: "",          label: "—",         color: "text-zinc-400 dark:text-zinc-500" },
  { value: "replied",   label: "Replied",   color: "text-emerald-600 dark:text-emerald-400" },
  { value: "interview", label: "Interview", color: "text-amber-600 dark:text-amber-400" },
  { value: "closed",    label: "Closed",    color: "text-zinc-400 dark:text-zinc-500" },
  { value: "skipped",   label: "Skipped",   color: "text-zinc-400 dark:text-zinc-500" },
];

const RESPONSE_STATUSES = new Set(["replied", "interview", "closed", "skipped"]);

function getOutreachValue(status: FundedStatus): string {
  return RESPONSE_STATUSES.has(status) ? "connected" : status;
}
function getResponseValue(status: FundedStatus): string {
  return RESPONSE_STATUSES.has(status) ? status : "";
}
function getColor(options: { value: string; color: string }[], val: string) {
  return options.find(o => o.value === val)?.color ?? "text-zinc-500";
}

const selectClass = "border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-sm font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-500 px-3 py-1.5 shadow-sm";

export default function FundedDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [lead, setLead]       = useState<FundedLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "email" | "chat">("overview");
  const [allContacts, setAllContacts]         = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [notes, setNotes]     = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const [emailLoading, setEmailLoading]   = useState(false);
  const [emailError, setEmailError]       = useState<string | null>(null);

  // Email send state
  const [emailTo, setEmailTo]             = useState("");
  const [emailSubject, setEmailSubject]   = useState("");
  const [emailBody, setEmailBody]         = useState("");
  const [sendLoading, setSendLoading]     = useState(false);
  const [sendError, setSendError]         = useState<string | null>(null);

  // Permutations state
  type PermResult = { email: string; status: "valid"|"invalid"|"catch-all"|"unknown"|"pending"|"skipped"; sub_status: string|null };
  const [permutations, setPermutations]   = useState<PermResult[]>([]);
  const [permLoading, setPermLoading]     = useState(false);
  const [permError, setPermError]         = useState<string | null>(null);
  const [validated, setValidated]         = useState(false);

  useEffect(() => {
    async function fetchLead() {
      const { data } = await supabase
        .from("funded_leads")
        .select("*, companies(*), contacts(*)")
        .eq("id", id)
        .single();
      if (data) {
        const l = data as FundedLead;
        setLead(l);
        setNotes(l.notes || "");
        // Pre-fill email fields
        setEmailTo(l.outreach_email || l.contacts?.email || "");
        if (l.email_draft) {
          const lines = l.email_draft.split("\n");
          const subjectLine = lines.find(line => line.toLowerCase().startsWith("subject:"));
          if (subjectLine) {
            setEmailSubject(subjectLine.replace(/^subject:\s*/i, "").trim());
            setEmailBody(lines.filter(line => !line.toLowerCase().startsWith("subject:")).join("\n").trim());
          } else {
            setEmailBody(l.email_draft);
          }
        }
        // Fetch all contacts for this company
        if (data.company_id) {
          const { data: contacts } = await supabase
            .from("contacts")
            .select("*")
            .eq("company_id", data.company_id)
            .order("created_at", { ascending: true });
          if (contacts && contacts.length > 0) {
            setAllContacts(contacts as Contact[]);
            setSelectedContactId(data.contact_id ?? contacts[0].id);
          }
        }
      }
      setLoading(false);
    }
    if (id) fetchLead();
  }, [id]);

  async function setStatus(status: FundedStatus) {
    if (!lead) return;
    await supabase.from("funded_leads").update({ status, last_action_at: new Date().toISOString() }).eq("id", lead.id);
    setLead({ ...lead, status });
  }

  async function saveNotes() {
    if (!lead) return;
    setSaveState("saving");
    await supabase.from("funded_leads").update({ notes }).eq("id", lead.id);
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  async function sendEmail() {
    if (!lead || !emailTo || !emailSubject || !emailBody) return;
    setSendLoading(true);
    setSendError(null);
    try {
      const res = await fetch("/api/send-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ lead_id: lead.id, to: emailTo, subject: emailSubject, body: emailBody }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLead(prev => prev ? { ...prev, email_status: "sent", email_sent_at: new Date().toISOString(), outreach_email: emailTo } : prev);
    } catch (e: any) {
      setSendError(e.message || "Failed to send email");
    } finally {
      setSendLoading(false);
    }
  }

  async function findPermutations() {
    if (!lead?.contacts) return;
    setPermLoading(true);
    setPermError(null);
    const domain = lead.companies?.domain || lead.companies?.website?.replace(/^https?:\/\//, "").split("/")[0] || null;
    if (!domain) { setPermError("No company domain found."); setPermLoading(false); return; }
    try {
      const res = await fetch("/api/validate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: lead.contacts.id, contact_name: lead.contacts.name, domain }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPermutations(data.permutations);
      setValidated(data.validated);
      if (data.best_email) setEmailTo(data.best_email);
    } catch (e: any) {
      setPermError(e.message || "Failed to generate permutations");
    } finally {
      setPermLoading(false);
    }
  }

  async function findEmail() {
    if (!lead?.contacts) return;
    setEmailLoading(true);
    setEmailError(null);
    const c = lead.contacts;
    const domain = lead.companies?.domain || lead.companies?.website || null;
    try {
      const res = await fetch("/api/reveal-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          apollo_person_id:     c.apollo_person_id,
          contact_id:           c.id,
          contact_name:         c.name,
          contact_domain:       domain,
          company_name:         lead.companies?.name,
          contact_linkedin_url: c.linkedin_url,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLead(prev => prev ? { ...prev, contacts: { ...prev.contacts!, email: data.email } } : prev);
    } catch (e: any) {
      setEmailError(e.message || "Failed to find email");
    } finally {
      setEmailLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F4] dark:bg-[#0f0f10] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return <div className="p-8 text-center text-zinc-500">Lead not found</div>;
  }

  const company     = lead.companies;
  const contact     = lead.contacts;
  const rawType = lead.raw_data?.company_type;
  const companyType = typeof rawType === "string" ? rawType : (rawType as any)?.name ?? null;
  const funding     = lead.funding_amount ? `$${(lead.funding_amount / 1_000_000).toFixed(1)}M` : null;
  const twitterConf = contact?.twitter_confidence ?? null;

  const websiteUrl = company?.website
    ? (company.website.startsWith("http") ? company.website : "https://" + company.website)
    : company?.domain ? "https://" + company.domain : null;

  const chatContext = {
    title:       `Outreach — ${company?.name ?? "this company"}`,
    company:     company?.name ?? "",
    description: [
      company?.description ? `About: ${company.description}` : null,
      funding ? `Funding: ${lead.round_type ? lead.round_type + " — " : ""}${funding}` : null,
      lead.announced_date ? `Announced: ${format(new Date(lead.announced_date + "T00:00:00"), "MMM d, yyyy")}` : null,
    ].filter(Boolean).join("\n"),
  };

  return (
    <div className="min-h-screen bg-[#F5F5F4] dark:bg-[#0f0f10] p-4 md:p-8">

      {/* Header */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-6 group">
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Back to Funded Companies
      </button>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 md:p-6 mb-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{company?.name || "—"}</h1>
              {companyType && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${TYPE_COLORS[companyType] ?? "bg-zinc-100 text-zinc-500"}`}>
                  {companyType}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              {funding && <span className="font-semibold text-emerald-600 dark:text-emerald-400">{funding}</span>}
              {lead.round_type && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span>{lead.round_type}</span></>}
              {lead.announced_date && (
                <><span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span>{format(new Date(lead.announced_date + "T00:00:00"), "MMM d, yyyy")}</span></>
              )}
              {lead.source && (
                <><span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="text-zinc-400 dark:text-zinc-500">{SOURCE_LABELS[lead.source] || lead.source}</span></>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <select
            value={getOutreachValue(lead.status)}
            onChange={e => setStatus(e.target.value as FundedStatus)}
            className={`flex-1 min-w-[120px] ${selectClass} ${getColor(OUTREACH_OPTIONS, getOutreachValue(lead.status))}`}
          >
            {OUTREACH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={getResponseValue(lead.status)}
            onChange={e => { if (e.target.value) setStatus(e.target.value as FundedStatus); }}
            className={`flex-1 min-w-[120px] ${selectClass} ${getColor(RESPONSE_OPTIONS, getResponseValue(lead.status))}`}
          >
            {RESPONSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Two Column Layout — tabs first on mobile, sidebar below */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Right Column — rendered first in DOM so it appears first on mobile */}
        <div className="lg:col-span-8 lg:order-2">

          {/* Company + Contact Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            {company && (
              <div className={`px-5 py-4 ${contact ? "border-b border-zinc-100 dark:border-zinc-800" : ""}`}>
                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Company</p>
                <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{company.name}</p>
                {(company.domain || company.website) && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {company.domain || company.website?.replace(/^https?:\/\//, "")}
                  </p>
                )}
                {(websiteUrl || company.linkedin_url) && (
                  <div className="flex gap-2 mt-3">
                    {websiteUrl && (
                      <a href={websiteUrl} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm">
                        <Globe className="w-4 h-4" /> Website
                      </a>
                    )}
                    {company.linkedin_url && (
                      <a href={company.linkedin_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm">
                        <Linkedin className="w-4 h-4" /> LinkedIn
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {contact && (
              <div className="px-5 py-4">
                <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                  Founder / Contact{allContacts.length > 1 ? ` (${allContacts.length})` : ""}
                </p>

                {/* Multi-contact picker — only shown when 2+ contacts exist */}
                {allContacts.length > 1 ? (
                  <div className="space-y-1 mb-3">
                    {allContacts.map(c => {
                      const isSelected = c.id === selectedContactId;
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedContactId(c.id);
                            setEmailTo(c.email || "");
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                            isSelected
                              ? "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20"
                              : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                          }`}
                        >
                          {/* Radio circle */}
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                            isSelected ? "border-violet-500" : "border-zinc-300 dark:border-zinc-600"
                          }`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                          </div>
                          {/* Avatar */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                            isSelected
                              ? "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                          }`}>
                            {c.name.charAt(0)}
                          </div>
                          {/* Name + title */}
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-medium truncate ${isSelected ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>
                              {c.name}
                            </p>
                            {c.title && (
                              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{c.title}</p>
                            )}
                          </div>
                          {/* LinkedIn icon if available */}
                          {c.linkedin_url && (
                            <a
                              href={c.linkedin_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="shrink-0 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              <Linkedin className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Single contact — original layout */
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 font-semibold text-sm shrink-0">
                      {contact.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{contact.name}</p>
                      {contact.title && <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{contact.title}</p>}
                    </div>
                  </div>
                )}

                {/* Social links — always show for the active contact */}
                {(() => {
                  const activeContact = allContacts.length > 1
                    ? allContacts.find(c => c.id === selectedContactId) ?? contact
                    : contact;
                  const activeTwitterConf = activeContact.twitter_confidence ?? null;
                  return (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {activeContact.linkedin_url && (
                          <a href={activeContact.linkedin_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                            <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                          </a>
                        )}
                        {activeContact.twitter_url && (
                          <a href={activeContact.twitter_url} target="_blank" rel="noreferrer"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              activeTwitterConf === "high"
                                ? "border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                : "border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            }`}>
                            <Twitter className="w-3.5 h-3.5" />
                            {activeTwitterConf !== "high" && <span className="text-[10px] ml-1">unverified</span>}
                          </a>
                        )}
                      </div>
                      <div className="mt-3">
                        {activeContact.email ? (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                            <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate">{activeContact.email}</span>
                            <CopyButton text={activeContact.email} label="" />
                          </div>
                        ) : (
                          <>
                            <button onClick={findEmail} disabled={emailLoading}
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors disabled:opacity-50">
                              <Mail className="w-3.5 h-3.5" />
                              {emailLoading ? "Finding email…" : "Find Email"}
                            </button>
                            {allContacts.length > 1 && (
                              <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">No email — use Find Addresses in the Email tab</p>
                            )}
                          </>
                        )}
                        {emailError && <p className="mt-1.5 text-[11px] text-red-500 dark:text-red-400">{emailError}</p>}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Your Notes</h3>
            <Textarea value={notes} onChange={setNotes} placeholder="Research notes, key insights..." className="mb-3 min-h-[120px]" />
            <Button variant="ghost" size="sm" onClick={saveNotes} disabled={saveState !== "idle"} className="w-full justify-center">
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved ✓" : "Save Notes"}
            </Button>
          </div>

        </div>

        {/* Left Column */}
        <div className="lg:col-span-4 lg:order-1 space-y-6">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden h-full flex flex-col min-h-[500px] lg:min-h-[600px]">

            {/* Tabs */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 relative">
              <div className="flex overflow-x-auto scrollbar-none [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]">
                {[
                  { id: "overview", label: "Company Overview" },
                  { id: "email",    label: "✉️ Email" },
                  { id: "chat",     label: "💬 Chat" },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? "border-violet-500 text-violet-600 dark:text-violet-400 bg-white dark:bg-zinc-800/50 shadow-sm"
                        : "border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/20"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-4 md:p-6 flex-1 overflow-y-auto">

              {/* Overview Tab */}
              {activeTab === "overview" && (
                <div className="space-y-5">

                  {/* Company type — top decision card (mirrors "Where You'd Need to Be") */}
                  {companyType && (
                    <div className={`rounded-xl p-4 border ${
                      companyType === "Consumer App"       ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" :
                      companyType === "DeFi / Protocol"    ? "bg-violet-50 border-violet-200 dark:bg-violet-900/20 dark:border-violet-800" :
                      companyType === "Infrastructure"     ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800" :
                      companyType === "Exchange / Trading" ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" :
                      "bg-zinc-50 border-zinc-200 dark:bg-zinc-800/40 dark:border-zinc-700"
                    }`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 text-zinc-500 dark:text-zinc-400">Company Category</p>
                      <p className={`text-sm font-semibold ${TYPE_COLORS[companyType]?.split(" ").slice(1).join(" ") ?? "text-zinc-700 dark:text-zinc-200"}`}>
                        {companyType}
                      </p>
                      {TYPE_DESCRIPTIONS[companyType] && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{TYPE_DESCRIPTIONS[companyType]}</p>
                      )}
                    </div>
                  )}

                  {/* Funding details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-100 dark:border-zinc-700">
                      <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Funding Raised</p>
                      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{funding ?? "Undisclosed"}</p>
                      {lead.round_type && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{lead.round_type}</p>}
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-100 dark:border-zinc-700">
                      <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Announced</p>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {lead.announced_date
                          ? format(new Date(lead.announced_date + "T00:00:00"), "MMM d, yyyy")
                          : "—"}
                      </p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{SOURCE_LABELS[lead.source] || lead.source}</p>
                    </div>
                  </div>

                  {/* Company description */}
                  {company?.description && (
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">About the Company</p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{company.description}</p>
                    </div>
                  )}

                  {/* Funds / investors if available */}
                  {lead.raw_data?.funds && lead.raw_data.funds.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Investors</p>
                      <div className="flex flex-wrap gap-1.5">
                        {lead.raw_data.funds.map((fund: any, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                            {typeof fund === "string" ? fund : fund.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Country if available */}
                  {lead.raw_data?.country && (
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-100 dark:border-zinc-700">
                      <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Country</p>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {typeof lead.raw_data.country === "string" ? lead.raw_data.country : (lead.raw_data.country as any)?.name}
                      </p>
                    </div>
                  )}

                </div>
              )}

              {/* Email Tab */}
              {activeTab === "email" && (
                <div className="space-y-5">

                  {/* Status banner — shows current email state clearly */}
                  {lead.email_status === "sent" && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Email sent</p>
                        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
                          To: {lead.outreach_email}
                          {lead.email_sent_at && <span className="ml-2">{format(new Date(lead.email_sent_at), "MMM d, h:mm a")}</span>}
                        </p>
                        <p className="text-xs text-emerald-600/60 dark:text-emerald-400/60 mt-0.5">Waiting for reply. Follow-up unlocks after 5 days.</p>
                      </div>
                    </div>
                  )}
                  {lead.email_status === "bounced" && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Email bounced</p>
                        <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                          {lead.outreach_email} was rejected. Trying next permutation automatically.
                        </p>
                      </div>
                    </div>
                  )}
                  {lead.email_status === "not_found" && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">No valid email found</p>
                        <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">All address permutations bounced. Try finding manually via LinkedIn.</p>
                      </div>
                    </div>
                  )}
                  {lead.email_status === "followed_up" && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <Clock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Follow-up sent</p>
                        {lead.follow_up_sent_at && <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">{format(new Date(lead.follow_up_sent_at), "MMM d, h:mm a")}</p>}
                      </div>
                    </div>
                  )}

                  {/* Email permutations finder */}
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700">
                      <div>
                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Email Address Finder</p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                          Generated from name + domain. Pick the one that looks right and send.
                        </p>
                      </div>
                      <button
                        onClick={findPermutations}
                        disabled={permLoading || !lead.contacts}
                        className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {permLoading ? "Finding…" : "Find Addresses"}
                      </button>
                    </div>

                    {permError && (
                      <p className="px-4 py-3 text-xs text-red-500">{permError}</p>
                    )}

                    {permutations.length > 0 && (
                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {permutations.map((p, i) => {
                          const statusColors: Record<string, string> = {
                            valid:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                            "catch-all":"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                            invalid:    "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                            unknown:    "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                            pending:    "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
                            skipped:    "bg-zinc-100 text-zinc-300 dark:bg-zinc-800 dark:text-zinc-600",
                          };
                          const statusLabel: Record<string, string> = {
                            valid:      "Valid",
                            "catch-all":"Catch-all",
                            invalid:    "Invalid",
                            unknown:    "Unknown",
                            pending:    "Best guess",
                            skipped:    "Skipped",
                          };
                          const isSelected = emailTo === p.email;
                          return (
                            <button
                              key={i}
                              onClick={() => setEmailTo(p.email)}
                              disabled={p.status === "invalid"}
                              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${isSelected ? "bg-violet-50 dark:bg-violet-900/20" : ""} disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${isSelected ? "border-violet-500" : "border-zinc-300 dark:border-zinc-600"}`}>
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-sm font-mono text-zinc-800 dark:text-zinc-200 block truncate">{p.email}</span>
                                  {p.sub_status && <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{p.sub_status}</span>}
                                </div>
                              </div>
                              <div className="shrink-0 ml-2">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColors[p.status] ?? statusColors.unknown}`}>
                                  {statusLabel[p.status] ?? p.status}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {permutations.length === 0 && !permLoading && !permError && (
                      <p className="px-4 py-4 text-xs text-zinc-400 dark:text-zinc-500">
                        {lead.contacts ? `Will generate patterns for ${lead.contacts.name} @ ${lead.companies?.domain || "company domain"}` : "No contact found for this company."}
                      </p>
                    )}
                  </div>

                  {/* To field */}
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1.5">To</label>
                    <input
                      type="email"
                      value={emailTo}
                      onChange={e => setEmailTo(e.target.value)}
                      placeholder="founder@company.com"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>

                  {/* Subject field */}
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1.5">Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      placeholder="Subject line..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block mb-1.5">Message</label>
                    <textarea
                      value={emailBody}
                      onChange={e => setEmailBody(e.target.value)}
                      rows={10}
                      placeholder="Email body — or open Chat tab to have Claude write or rewrite it."
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none leading-relaxed font-mono"
                    />
                  </div>

                  {/* Actions */}
                  {sendError && <p className="text-sm text-red-500 dark:text-red-400">{sendError}</p>}
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={sendEmail}
                      disabled={sendLoading || !emailTo || !emailSubject || !emailBody || lead.email_status === "sent" || lead.email_status === "followed_up"}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                      {sendLoading ? "Sending…" : lead.email_status === "sent" ? "Sent ✓" : "Send Email"}
                    </button>
                    <button
                      onClick={() => setActiveTab("chat")}
                      className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Rewrite with Claude
                    </button>
                  </div>

                  {/* Follow-up section — appears after 5 days with no reply */}
                  {lead.email_status === "sent" && lead.follow_up_message && (() => {
                    const daysSinceSent = lead.email_sent_at
                      ? Math.floor((Date.now() - new Date(lead.email_sent_at).getTime()) / 86400000)
                      : 0;
                    const daysLeft = 5 - daysSinceSent;
                    return (
                      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Follow-up</p>
                          {daysLeft > 0
                            ? <span className="text-[11px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">Unlocks in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</span>
                            : <span className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full font-medium">Ready to send</span>
                          }
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-100 dark:border-zinc-700 font-mono text-xs">
                          {lead.follow_up_message}
                        </p>
                        <button
                          onClick={async () => {
                            if (daysLeft > 0) return;
                            setSendLoading(true);
                            setSendError(null);
                            try {
                              const res = await fetch("/api/send-email", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ lead_id: lead.id, to: emailTo, subject: `Re: ${emailSubject}`, body: lead.follow_up_message }),
                              });
                              const data = await res.json();
                              if (data.error) throw new Error(data.error);
                              setLead(prev => prev ? { ...prev, email_status: "followed_up", follow_up_sent_at: new Date().toISOString() } : prev);
                            } catch (e: any) {
                              setSendError(e.message);
                            } finally {
                              setSendLoading(false);
                            }
                          }}
                          disabled={sendLoading || daysLeft > 0}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-300 dark:border-blue-700 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Send className="w-3.5 h-3.5" /> Send Follow-up
                        </button>
                      </div>
                    );
                  })()}

                </div>
              )}

              {/* Chat Tab — always mounted to preserve history */}
              <div className={`h-full flex flex-col ${activeTab === "chat" ? "" : "hidden"}`} style={{ minHeight: "460px" }}>
                <ChatPanel jobContext={chatContext} />
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
