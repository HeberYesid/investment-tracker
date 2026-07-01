"use client";

import { useCallback, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getMemberLabels } from "@/lib/i18n/members";
import { errors as errorMessages } from "@/lib/i18n/errors";
import { cn } from "@/lib/utils";
import { InviteMemberInput, UpdateMemberRoleInput } from "@/lib/validations/members";
import type { PortfolioRole } from "@/lib/csv/constants";

import { type Member, getRoleLabel } from "./members-types";

const labels = getMemberLabels();

type MembersManagementClientProps = {
  initialMembers: Member[];
  currentUserId: string;
};

type ActionState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

const inputClass =
  "mt-1 h-10 w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary focus:border-border-default focus:outline-none focus:ring-2 focus:ring-focus-ring";
const labelClass = "block text-xs font-medium text-text-muted";

export function MembersManagementClient({
  initialMembers,
  currentUserId,
}: MembersManagementClientProps) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<ActionState>({ kind: "idle" });
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  const decoratedMembers = members.map((m) => ({
    ...m,
    is_self: m.user_id === currentUserId,
  }));

  const handleAdd = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setAction({ kind: "idle" });

      const parsed = InviteMemberInput.safeParse({ email, role });
      if (!parsed.success) {
        setAction({
          kind: "error",
          message: parsed.error.issues[0]?.message ?? labels.errorLoadMembers,
        });
        return;
      }

      setAdding(true);
      try {
        const res = await fetch("/api/v1/portfolio/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const message =
            res.status === 404
              ? labels.errorEmailNotFound
              : res.status === 409
                ? labels.errorMemberExists
                : (err.error?.message ?? labels.errorLoadMembers);
          setAction({ kind: "error", message });
          return;
        }

        const json = (await res.json()) as { data: Member };
        setMembers((prev) => [...prev, json.data]);
        setEmail("");
        setRole("EDITOR");
        setAction({ kind: "success", message: "Miembro agregado." });
      } catch {
        setAction({ kind: "error", message: errorMessages.unknown });
      } finally {
        setAdding(false);
      }
    },
    [email, role],
  );

  const handleChangeRole = useCallback(
    async (member: Member, newRole: PortfolioRole) => {
      setAction({ kind: "idle" });
      setBusyMemberId(member.user_id);

      const parsed = UpdateMemberRoleInput.safeParse({ role: newRole });
      if (!parsed.success) {
        setBusyMemberId(null);
        return;
      }

      try {
        const res = await fetch(
          `/api/v1/portfolio/members/${member.user_id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
          },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setAction({
            kind: "error",
            message: err.error?.message ?? labels.errorLoadMembers,
          });
          return;
        }

        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === member.user_id ? { ...m, role: newRole } : m,
          ),
        );
      } catch {
        setAction({ kind: "error", message: errorMessages.unknown });
      } finally {
        setBusyMemberId(null);
      }
    },
    [],
  );

  const handleRemove = useCallback(async (member: Member) => {
    if (member.is_self) return;
    if (!confirm(labels.confirmRemove)) return;

    setAction({ kind: "idle" });
    setBusyMemberId(member.user_id);

    try {
      const res = await fetch(
        `/api/v1/portfolio/members/${member.user_id}`,
        { method: "DELETE" },
      );

      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        setAction({
          kind: "error",
          message: err.error?.message ?? labels.errorLoadMembers,
        });
        return;
      }

      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
    } catch {
      setAction({ kind: "error", message: errorMessages.unknown });
    } finally {
      setBusyMemberId(null);
    }
  }, []);

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAdd}
        className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-border-subtle sm:p-6"
        noValidate
      >
        <h2 className="text-base font-semibold text-text-primary">
          {labels.addMemberTitle}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {labels.addMemberDescription}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr,180px,auto]">
          <div>
            <label htmlFor="member-email" className={labelClass}>
              {labels.emailLabel}
            </label>
            <input
              id="member-email"
              type="email"
              required
              placeholder={labels.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={adding}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="member-role" className={labelClass}>
              {labels.roleLabel}
            </label>
            <select
              id="member-role"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "EDITOR" | "VIEWER")
              }
              disabled={adding}
              className={inputClass}
            >
              <option value="EDITOR">{labels.roleEditor}</option>
              <option value="VIEWER">{labels.roleViewer}</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={adding} className="w-full">
              {adding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {labels.adding}
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {labels.addButton}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {action.kind === "error" && (
        <div
          role="alert"
          className="rounded-2xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800"
        >
          {action.message}
        </div>
      )}

      <section className="rounded-3xl bg-surface shadow-sm ring-1 ring-border-subtle">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
              <th className="px-5 py-3">{labels.tableHeaderMember}</th>
              <th className="px-5 py-3">{labels.tableHeaderRole}</th>
              <th className="px-5 py-3 text-right">
                {labels.tableHeaderActions}
              </th>
            </tr>
          </thead>
          <tbody>
            {decoratedMembers.map((member) => (
              <tr
                key={member.user_id}
                className="border-b border-border-subtle last:border-0"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">
                      {member.email ?? member.user_id}
                    </span>
                    {member.is_self && (
                      <span
                        data-testid="you-badge"
                        className={cn(
                          "inline-flex items-center rounded-full bg-action-primary px-2 py-0.5",
                          "text-[10px] font-semibold uppercase tracking-wide text-action-primary-fg",
                        )}
                      >
                        {labels.tableYouBadge}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  {member.is_self ? (
                    <span className="text-sm text-text-secondary">
                      {getRoleLabel(member.role)}
                    </span>
                  ) : (
                    <select
                      aria-label={labels.roleLabel}
                      value={member.role}
                      disabled={busyMemberId === member.user_id}
                      onChange={(e) =>
                        handleChangeRole(
                          member,
                          e.target.value as PortfolioRole,
                        )
                      }
                      className="h-9 rounded-xl border border-border-subtle bg-surface px-2 text-sm text-text-primary focus:border-border-default focus:outline-none focus:ring-2 focus:ring-focus-ring"
                    >
                      <option value="OWNER">{getRoleLabel("OWNER")}</option>
                      <option value="EDITOR">{getRoleLabel("EDITOR")}</option>
                      <option value="VIEWER">{getRoleLabel("VIEWER")}</option>
                    </select>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {member.is_self ? (
                    <span
                      className="text-xs text-text-subtle"
                      title={labels.youCannotRemoveYourself}
                    >
                      —
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyMemberId === member.user_id}
                      onClick={() => handleRemove(member)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {labels.removeButton}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
