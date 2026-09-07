// Razekit status chips — uses brand colour tokens from the PDF colour system.
const STATUS_CONFIG = {
  draft:           { label: 'Draft',     cls: 'bg-[#5F7597]/10 text-[#5F7597]' },
  open:            { label: 'Open',      cls: 'bg-[#12684A]/10 text-[#12684A]' },
  paused:          { label: 'Paused',    cls: 'bg-[#D78C05]/10 text-[#D78C05]' },
  joined:          { label: 'Joined',    cls: 'bg-[#1A7BF8]/10 text-[#1A7BF8]' },
  working:         { label: 'Working',   cls: 'bg-[#1A7BF8]/10 text-[#1A7BF8]' },
  submitted:       { label: 'Submitted', cls: 'bg-[#D78C05]/10 text-[#D78C05]' },
  reviewing:       { label: 'Reviewing', cls: 'bg-[#0B48E8]/10 text-[#0B48E8]' },
  winner_selected: { label: 'Winner ✓', cls: 'bg-[#12684A]/10 text-[#12684A]' },
  completed:       { label: 'Complete',  cls: 'bg-[#12684A]/15 text-[#12684A]' },
};

export default function ContestStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full font-semibold tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}