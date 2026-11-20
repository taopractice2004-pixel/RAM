export type Field = { label: string; type: string; requiredForNew: boolean };
export type Row = {
  rowNumber: number;
  source?: Record<string, string>;
  values: Record<string, string>;
  errors: string[];
  status: string;
  notes?: string[];
  changes?: Array<{ field: string; current: string | null; proposed: string }>;
};
