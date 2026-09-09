'use client';
import { useEffect, useState } from 'react';
import { Brand } from './brand';
import { Choice } from './app-primitives';
import { api, errorText } from '@/lib/client';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import './chat.css';
type Report = {
  id: string;
  reported: string;
  reason: string;
  details: string;
  context: string;
  username: string;
  standing: string;
  createdAt: number;
};
type Ticket = {
  id: string;
  profileId: string;
  username: string;
  category: string;
  message: string;
  createdAt: number;
};
export function ModerationConsole() {
  const [reports, setReports] = useState<Report[]>([]),
    [tickets, setTickets] = useState<Ticket[]>([]),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<Report | Ticket | null>(null),
    [action, setAction] = useState('resolve'),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [reports, tickets] = await Promise.all([
        api<Report[]>('/admin/reports'),
        api<Ticket[]>('/admin/support'),
      ]);
      setReports(reports);
      setTickets(tickets);
    } catch (error) {
      setError(errorText(error));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <main className="moderation-layout">
      <header className="site-header">
        <Brand />
        <a href="/chat">Return to chat</a>
      </header>
      <div className="page-view">
        <h1>Community care</h1>
        <p>
          Review context, record a reason, and apply a proportionate action.
          Every decision is logged.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <h2>
          Open reports <span>{reports.length}</span>
        </h2>
        <div className="moderation-grid">
          {reports.map((report) => (
            <article className="settings-card" key={report.id}>
              <strong>{report.username || 'Deleted account'}</strong>
              <p>
                {report.reason} · {report.standing || 'Unknown standing'}
              </p>
              <p>{report.details || 'No additional details.'}</p>
              <button
                className="button button-outline"
                onClick={() => {
                  setSelected(report);
                  setAction('resolve');
                  setReason('');
                }}
              >
                Review report
              </button>
            </article>
          ))}
        </div>
        {!reports.length && !error && <p>No open reports.</p>}
        <h2>
          Support requests <span>{tickets.length}</span>
        </h2>
        <div className="moderation-grid">
          {tickets.map((ticket) => (
            <article className="settings-card" key={ticket.id}>
              <strong>
                {ticket.username || 'Deleted account'} · {ticket.category}
              </strong>
              <p>{ticket.message}</p>
              <button
                className="button button-outline"
                onClick={() => {
                  setSelected(ticket);
                  setReason('');
                }}
              >
                Reply
              </button>
            </article>
          ))}
        </div>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="app-dialog moderation-dialog">
          <DialogTitle>
            {selected && 'reported' in selected
              ? 'Review report'
              : 'Reply to support request'}
          </DialogTitle>
          <DialogDescription>
            Review the supplied context before taking action.
          </DialogDescription>
          {selected && 'reported' in selected ? (
            <>
              <p>{selected.details}</p>
              <div className="report-context">
                {(
                  JSON.parse(selected.context || '[]') as {
                    senderName: string;
                    text: string;
                    kind: string;
                  }[]
                ).map((m, i) => (
                  <p key={i}>
                    <strong>{m.senderName}: </strong>
                    {m.kind === 'text' ? m.text : `[${m.kind} attachment]`}
                  </p>
                ))}
              </div>
              <Choice
                label="Decision"
                value={action}
                onChange={setAction}
                options={[
                  {
                    value: 'resolve',
                    label: 'Close report without restriction',
                  },
                  { value: 'warning', label: 'Issue a warning' },
                  { value: 'limited', label: 'Limit messaging and matching' },
                  { value: 'at-risk', label: 'Mark account at risk' },
                  { value: 'suspended', label: 'Suspend account' },
                  { value: 'good', label: 'Restore good standing' },
                ]}
              />
            </>
          ) : (
            <p>{selected?.message}</p>
          )}
          <label className="form-field">
            {selected && 'reported' in selected ? 'Reason' : 'Response'}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              minLength={5}
              maxLength={selected && 'reported' in selected ? 1000 : 4000}
            />
          </label>
          <button
            className="button button-primary"
            disabled={busy || reason.trim().length < 5}
            onClick={async () => {
              if (!selected) return;
              setBusy(true);
              try {
                if ('reported' in selected) {
                  await api(
                    action === 'resolve'
                      ? '/admin/reports/resolve'
                      : '/admin/standing',
                    {
                      method: 'POST',
                      body: JSON.stringify(
                        action === 'resolve'
                          ? { id: selected.id, reason }
                          : {
                              profileId: selected.reported,
                              standing: action,
                              reportId: selected.id,
                              reason,
                            },
                      ),
                    },
                  );
                } else
                  await api('/admin/support/respond', {
                    method: 'POST',
                    body: JSON.stringify({ id: selected.id, response: reason }),
                  });
                setSelected(null);
                await load();
              } catch (error) {
                setError(errorText(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Saving…' : 'Save decision'}
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
