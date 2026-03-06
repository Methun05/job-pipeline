"use client";
import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  Building2, ChevronDown, ChevronUp, ExternalLink,
  Mail, Clock, AlertCircle
} from "lucide-react";
import { Badge, Button, Divider, Textarea, cn } from "./ui";
import CopyButton from "./CopyButton";
import type { FundedLead, FundedStatus } from "@/lib/types";
import { supabase } from "@/lib/supabase";

const SOURCE_LABELS: Record<string, string> = {
  cryptorank: "CryptoRank",
  techcrunch:  "TechCrunch",
  eu_startups: "EU Startups",
};

const STATUS_CONFIG: Record<FundedStatus, { label: string; color: string }> = {
  new:              { label: "New",              color: "blue"   },
  connection_sent:  { label: "Connection Sent",  color: "purple" },
  connected:        { label: "Connected",        color: "green"  },
  replied:          { label: "Replied",          color: "green"  },
  interview:        { label: "Interview",        color: "yellow" },
  closed:           { label: "Closed",           color: "gray"   },
  skipped:          { label: "Skipped",          color: "gray"   },
  cant_find:        { label: "Can't Find",       color: "red"    },
};

export default function FundedCompanyCard({
  lead,
  onStatusChange,
}: {
  lead: FundedLead;
  onStatusChange: (id: string, status: FundedStatus) => void;
}) {
  const [expanded, setExpanded]         = useState(false);
  const [showEmail, setShowEmail]       = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult]   = useState<string | null>(lead.contacts?.email || null);
  const [notes, setNotes]               = useState(lead.notes || "");
  const [saving, setSaving]             = useState(false);
  const [creditsConfirm, setCreditsConfirm] = useState(false);

  const company  = lead.companies;
  const contact  = lead.contacts;
  const statusCfg = STATUS_CONFIG[lead.status];
  const isFollowUp = lead.follow_up_generated && lead.follow_up_message;
  const daysSince = lead.last_action_at
    ? Math.floor((Date.now() - new Date(lead.last_action_at).getTime()) / 86400000)
    : null;

  async function updateStatus(status: FundedStatus) {
    await supabase.from("funded_leads").update({
      status,
      last_action_at: new Date().toISOString(),
    }).eq("id", lead.id);
    onStatusChange(lead.id, status);
  }

  async function saveNotes() {
    setSaving(true);
    await supabase.from("funded_leads").update({ notes }).eq("id", lead.id);
    setSaving(false);
  }

  async function handleRevealEmail() {
    if (!contact?.apollo_person_id) return;
    setEmailLoading(true);
    try {
      const res = await fetch("/api/reveal-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          apollo_person_id: contact.apollo_person_id,
          contact_id:       contact.id,
        }),
      });
      const data = await res.json();
      if (data.email) {
        setEmailResult(data.email);
      } else {
        alert(data.error || "Could not retrieve email.");
      }
    } catch {
      alert("Request failed.");
    }
    setEmailLoading(false);
    setCreditsConfirm(false);
  }

  const messageToShow = isFollowUp ? lead.follow_up_message! : lead.linkedin_note || "";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant={statusCfg.color as "blue" | "purple" | "green" | "yellow" | "red" | "gray"}>
                {statusCfg.label}
              </Badge>
              {isFollowUp && (
                <Badge variant="yellow">
                  <Clock className="w-3 h-3 mr-1" />Follow Up Ready
                </Badge>
              )}
            </div>
            <h3 className="text-base font-bold text-zinc-100 truncate">{company?.name}</h3>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-emerald-400">
              ${lead.funding_amount ? (lead.funding_amount / 1_000_000).toFixed(1) + "M" : "—"}
            </p>
            <p className="text-xs text-zinc-500">{lead.round_type}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
          <span>{SOURCE_LABELS[lead.source] || lead.source}</span>
          {lead.announced_date && (
            <>
              <span>·</span>
              <span>{format(new Date(lead.announced_date), "MMM d, yyyy")}</span>
            </>
          )}
          {daysSince !== null && daysSince >= 7 && (
            <>
              <span>·</span>
              <span className="text-amber-500">
                <AlertCircle className="w-3 h-3 inline mr-0.5" />
                {daysSince}d inactive
              </span>
            </>
          )}
        </div>

        {/* Company summary */}
        {company?.description && (
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{company.description}</p>
        )}
        {!company?.description && (
          <p className="text-sm text-zinc-600 mt-2 italic">No summary available</p>
        )}
      </div>

      <Divider />

      {/* Contact */}
      <div className="px-4 pb-3">
        {contact ? (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-zinc-200">{contact.name}</p>
              <p className="text-xs text-zinc-500">{contact.title}</p>
            </div>
            <div className="flex gap-2">
              {contact.linkedin_url && (
                <a
                  href={contact.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 border border-blue-800/50 rounded-lg text-xs font-medium transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />LinkedIn
                </a>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-600 italic">No contact found</p>
        )}
      </div>

      {/* Expandable content */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-sm text-zinc-400"
      >
        <span>Message &amp; Actions</span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-4 border-t border-zinc-800">
          {/* LinkedIn note */}
          {messageToShow && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  {isFollowUp ? "Follow-up Message" : "LinkedIn Message"}
                </p>
                <CopyButton text={messageToShow} label="Copy" />
              </div>
              <div className="bg-zinc-800 rounded-xl p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {messageToShow}
              </div>
            </div>
          )}

          {/* Email draft */}
          {lead.email_draft && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Email Draft</p>
              <div className="bg-zinc-800 rounded-xl p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                {lead.email_draft}
              </div>
              <CopyButton text={lead.email_draft} label="Copy Email" className="mt-2" />
            </div>
          )}

          {/* Find Email */}
          {contact?.apollo_person_id && !emailResult && (
            <div>
              {!creditsConfirm ? (
                <Button variant="ghost" onClick={() => setCreditsConfirm(true)}>
                  <Mail className="w-4 h-4" />
                  Find Email
                </Button>
              ) : (
                <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-3">
                  <p className="text-sm text-amber-300 mb-3">
                    This uses <strong>1 Apollo credit</strong>. Proceed?
                  </p>
                  <div className="flex gap-2">
                    <Button variant="danger" onClick={handleRevealEmail} disabled={emailLoading}>
                      {emailLoading ? "Loading..." : "Yes, reveal email"}
                    </Button>
                    <Button variant="ghost" onClick={() => setCreditsConfirm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {emailResult && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-300 font-medium">{emailResult}</span>
              <CopyButton text={emailResult} label="Copy" />
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Notes</p>
            <Textarea
              value={notes}
              onChange={setNotes}
              placeholder="Add notes..."
              rows={2}
            />
            <Button variant="ghost" size="sm" onClick={saveNotes} disabled={saving} className="mt-2">
              {saving ? "Saving..." : "Save notes"}
            </Button>
          </div>

          {/* Status actions */}
          <Divider />
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {lead.status === "new" && (
                <>
                  <Button variant="success" onClick={() => updateStatus("connection_sent")}>
                    ✅ Connection Sent
                  </Button>
                  <Button variant="ghost" onClick={() => updateStatus("cant_find")}>
                    ❌ Can't Find Person
                  </Button>
                  <Button variant="ghost" onClick={() => updateStatus("skipped")}>
                    ⏭ Skip
                  </Button>
                </>
              )}
              {lead.status === "connection_sent" && (
                <>
                  <Button variant="success" onClick={() => updateStatus("connected")}>
                    ✅ Connected
                  </Button>
                  <Button variant="ghost" onClick={() => updateStatus("skipped")}>⏭ Skip</Button>
                </>
              )}
              {lead.status === "connected" && (
                <>
                  <Button variant="success" onClick={() => updateStatus("replied")}>
                    💬 They Replied
                  </Button>
                </>
              )}
              {lead.status === "replied" && (
                <>
                  <Button variant="success" onClick={() => updateStatus("interview")}>
                    📅 Interview Scheduled
                  </Button>
                  <Button variant="ghost" onClick={() => updateStatus("closed")}>Close</Button>
                </>
              )}
              {lead.status === "interview" && (
                <Button variant="ghost" onClick={() => updateStatus("closed")}>Close</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
