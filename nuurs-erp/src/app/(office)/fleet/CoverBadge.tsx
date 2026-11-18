import { fmtDate } from "@/lib/format";

/** Current insurance cover at a glance: valid, ending within 30 days, or ended. */
export function CoverBadge({ end }: { end: Date | null }) {
  if (!end) return <span className="badge bad">Даатгалгүй</span>;
  const days = (end.getTime() - Date.now()) / 86_400_000;
  if (days < 0) return <span className="badge bad">Дууссан {fmtDate(end)}</span>;
  if (days <= 30) return <span className="badge warn">{fmtDate(end)} дуусна</span>;
  return <span className="badge ok">Хүчинтэй {fmtDate(end)}</span>;
}
