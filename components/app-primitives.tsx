'use client';
import { PlanRequirement } from './plan-requirement';
import { LoaderCircle, Sparkles } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Peer, Profile } from '@/lib/domain';
export function Avatar({
  person,
  size = 'normal',
}: {
  person: Pick<Peer, 'avatar' | 'username'>;
  size?: 'small' | 'normal' | 'large';
}) {
  return (
    <span className={`avatar user-avatar avatar-${size}`}>
      {person.avatar?.startsWith('/api/media/') ? (
        <img src={person.avatar} alt="" width="48" height="48" />
      ) : (
        person.avatar || person.username.slice(0, 1)
      )}
    </span>
  );
}
export function Badge({
  person,
}: {
  person: Pick<Peer, 'plan' | 'ai'> | Profile;
}) {
  if ('ai' in person && person.ai)
    return (
      <span className="badge badge-ai">
        <Sparkles size={11} /> AI companion
      </span>
    );
  if (person.plan === 'free') return null;
  return <span className={`badge badge-${person.plan}`}>{person.plan}</span>;
}
export function Choice({
  label,
  value,
  onChange,
  options,
  disabled = false,
  requiredPlan,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  requiredPlan?: 'basic' | 'plus';
}) {
  return (
    <div className="form-field">
      <label>
        {label} {requiredPlan && <PlanRequirement plan={requiredPlan} />}
      </label>
      <Select
        value={value}
        onValueChange={(v) => v !== null && onChange(String(v))}
        items={options}
        disabled={disabled}
      >
        <SelectTrigger className="choice-trigger" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
  requiredPlan,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  requiredPlan?: 'basic' | 'plus';
}) {
  return (
    <div className="toggle-row">
      <div>
        <strong>
          {title} {requiredPlan && <PlanRequirement plan={requiredPlan} />}
        </strong>
        {description && <p>{description}</p>}
      </div>
      <Switch
        aria-label={title}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
export function Loading({
  label = 'Getting things ready…',
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" />
      <p>{label}</p>
    </div>
  );
}
export function Empty({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
