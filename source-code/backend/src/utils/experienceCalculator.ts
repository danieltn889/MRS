import { PoolClient } from 'pg';

interface DateInterval {
  start: Date;
  end: Date;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// Recomputes candidate_profiles.years_experience AND headline from the
// candidate's work_experience rows, so both stay derived from what's
// actually listed rather than separately hand-typed values that can drift
// out of sync. years_experience merges overlapping/concurrent roles before
// summing (so holding two jobs at once doesn't double-count that period);
// headline lists each role's own individual duration instead, e.g.
// "Software Developer (2.3 years), Marketing Manager (1.8 years)".
export const recalculateYearsExperience = async (client: PoolClient, userId: string): Promise<number> => {
  const result = await client.query<{ title: string; start_date: string; end_date: string | null; is_current: boolean }>(
    `SELECT title, start_date, end_date, is_current FROM work_experience WHERE user_id = $1 ORDER BY start_date DESC`,
    [userId]
  );

  const rows = result.rows
    .map(row => {
      const start = new Date(row.start_date);
      const end = row.is_current || !row.end_date ? new Date() : new Date(row.end_date);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return null;
      return { title: row.title, start, end };
    })
    .filter((r): r is { title: string; start: Date; end: Date } => r !== null);

  // years_experience: merge overlapping intervals first, so concurrent roles aren't double-counted.
  const merged: DateInterval[] = [];
  for (const row of [...rows].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const last = merged[merged.length - 1];
    if (last && row.start.getTime() <= last.end.getTime()) {
      if (row.end.getTime() > last.end.getTime()) last.end = row.end;
    } else {
      merged.push({ start: row.start, end: row.end });
    }
  }
  const totalMs = merged.reduce((sum, i) => sum + (i.end.getTime() - i.start.getTime()), 0);
  const years = Math.round(totalMs / MS_PER_YEAR);

  // headline: each role's own duration, most recent first, truncated to fit
  // the column (VARCHAR(255)) without cutting a role's text mid-word.
  let headline = rows
    .map(row => `${row.title} (${((row.end.getTime() - row.start.getTime()) / MS_PER_YEAR).toFixed(1)} years)`)
    .join(', ');
  if (headline.length > 255) {
    headline = headline.slice(0, 252).replace(/,\s*[^,]*$/, '') + '…';
  }

  await client.query(
    `UPDATE candidate_profiles SET years_experience = $1, headline = $2, updated_at = NOW() WHERE user_id = $3`,
    [years, headline || null, userId]
  );

  return years;
};
