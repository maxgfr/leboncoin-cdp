export type Ad = {
  list_id: string;
  title: string;
  description: string;
  url: string;
  price: number;
  date: Date;
  city: string;
  user_id: string;
  has_phone: boolean;
  phone_number?: string;
  attributes: Record<string, string>;
};

export type SearchResults = {
  total: number;
  results: Ad[];
};
