export type Transaction = {
  date: string; // yyyy-MM-dd
  amount: number;
  note: string;
  cat: string;
  sub: string;
  // Sheet row this transaction lives on (1-based, so first data row is 2).
  // Populated by listTransactions; absent on optimistic local-only writes
  // until a refresh round-trip reconciles them.
  _row?: number;
};

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
};
