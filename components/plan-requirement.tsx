import { Crown } from 'lucide-react';
export function PlanRequirement({ plan }: { plan: 'basic' | 'plus' }) {
  return (
    <span
      className="plan-requirement"
      title={plan === 'plus' ? 'Requires Plus' : 'Requires Basic or Plus'}
    >
      <Crown size={12} aria-hidden="true" />
      <span>{plan === 'plus' ? 'Plus' : 'Basic+'}</span>
    </span>
  );
}
