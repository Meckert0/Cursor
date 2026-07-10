export interface TablePreferencesRecord {
  userId: string;
  scope: string;
  columnOrder: string[];
  columnWidths: Record<string, number>;
  updatedAt: string;
}
