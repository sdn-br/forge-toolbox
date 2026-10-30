/** A technology that rewards expansions of the main city. */
export interface ResearchExpansion {
  tech: string;
  name: string;
  /** main city expansions it rewards */
  amount: number;
}
