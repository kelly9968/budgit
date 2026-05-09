export type Transaction = {
  date: string; // yyyy-MM-dd
  amount: number;
  note: string;
  cat: string;
  sub: string;
};

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
};
